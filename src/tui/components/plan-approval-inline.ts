/**
 * Inline plan approval component.
 * Shows a submitted plan as rendered markdown with approval options
 * directly in the conversation flow.
 */

import {
  Box,
  Container,
  getKeybindings,
  Input,
  Markdown,
  SelectList,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import type { Component, Focusable, SelectItem, TUI } from '@earendil-works/pi-tui';
import chalk from 'chalk';
import { BOX_INDENT, theme, getSelectListTheme, getMarkdownTheme, mastra } from '../theme.js';
import type { ChatSpacingKind } from './chat-spacing.js';

export interface PlanApprovalInlineOptions {
  toolCallId: string;
  title: string;
  plan: string;
  onApprove: () => void;
  onGoal: () => void;
  onReject: (feedback?: string) => void;
}

class PlanContentBox implements Component {
  constructor(private plan: string) {}

  invalidate(): void {}

  render(width: number): string[] {
    const availableWidth = Math.max(24, width - BOX_INDENT);
    const innerWidth = Math.max(20, availableWidth - 4);
    const markdown = new Markdown(this.plan, 0, 0, getMarkdownTheme(), {
      color: (text: string) => theme.fg('text', text),
    });
    const rendered = markdown.render(innerWidth).flatMap(line => (line.length > 0 ? [line] : ['']));
    const border = (text: string) => chalk.hex(mastra.purple)(text);
    const top = `${border('╭')}${border('─'.repeat(innerWidth + 2))}${border('╮')}`;
    const bottom = `${border('╰')}${border('─'.repeat(innerWidth + 2))}${border('╯')}`;
    const body = rendered.map(line => {
      let content = line;
      let contentVis = visibleWidth(content);
      if (contentVis > innerWidth) {
        content = truncateToWidth(content, innerWidth);
        contentVis = visibleWidth(content);
      }
      const padding = ' '.repeat(Math.max(0, innerWidth - contentVis));
      return `${border('│')} ${content}${padding} ${border('│')}`;
    });
    return [top, ...body, bottom];
  }
}

export class PlanApprovalInlineComponent extends Container implements Focusable {
  private contentBox: Box;
  private selectList?: SelectList;
  private feedbackInput?: Input;
  private onApprove?: () => void;
  private onGoal?: () => void;
  private onReject?: (feedback?: string) => void;
  private resolved = false;
  private mode: 'streaming' | 'select' | 'feedback' = 'select';
  private planTitle: string;
  private planContent: string;

  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    if (this.mode === 'feedback' && this.feedbackInput) {
      this.feedbackInput.focused = value;
    }
  }

  constructor(
    options: PlanApprovalInlineOptions,
    private ui: TUI,
  ) {
    super();
    this.planTitle = options.title;
    this.planContent = options.plan;
    this.contentBox = new Box(BOX_INDENT, 0, (text: string) => text);
    this.addChild(this.contentBox);
    this.activate(options);
  }

  static createStreaming(ui: TUI): PlanApprovalInlineComponent {
    const component = new PlanApprovalInlineComponent(
      {
        toolCallId: '',
        title: '未命名计划',
        plan: '',
        onApprove: () => {},
        onGoal: () => {},
        onReject: () => {},
      },
      ui,
    );
    component.mode = 'streaming';
    component.resolved = false;
    component.renderStreaming();
    return component;
  }

  activate(options: PlanApprovalInlineOptions): void {
    this.onApprove = options.onApprove;
    this.onGoal = options.onGoal;
    this.onReject = options.onReject;
    this.planTitle = options.title;
    this.planContent = options.plan;
    this.mode = 'select';
    this.resolved = false;
    this.renderSelectable();
  }

  getChatSpacingKind(): ChatSpacingKind {
    return 'plan';
  }

  updateArgs(args: unknown): void {
    if (!args || typeof args !== 'object' || this.resolved) return;
    const partial = args as { title?: unknown; plan?: unknown };
    if (typeof partial.title === 'string') {
      this.planTitle = partial.title || '未命名计划';
    }
    if (typeof partial.plan === 'string') {
      this.planContent = partial.plan;
    }
    if (this.mode === 'streaming') {
      this.renderStreaming();
    }
  }

  private renderSelectable(): void {
    this.contentBox.clear();
    this.selectList = undefined;
    this.feedbackInput = undefined;
    this.renderPlanHeader();
    this.renderPlanContent();

    const items: SelectItem[] = [
      {
        value: 'approve',
        label: `  ${theme.fg('success', '批准并执行')} ${theme.fg('dim', '- 切换到 Build 模式并开始实现')}`,
      },
      {
        value: 'goal',
        label: `  ${theme.fg('success', '设为 /goal')} ${theme.fg('dim', '- 切换到 Build 模式并持续执行该计划')}`,
      },
      {
        value: 'reject',
        label: `  ${theme.fg('error', '拒绝')} ${theme.fg('dim', '- 留在 Plan 模式')}`,
      },
      {
        value: 'edit',
        label: `  ${theme.fg('warning', '要求修改')} ${theme.fg('dim', '- 填写修改意见')}`,
      },
    ];

    this.selectList = new SelectList(items, items.length, getSelectListTheme());

    this.selectList.onSelect = (item: SelectItem) => {
      this.handleSelection(item.value);
    };
    this.selectList.onCancel = () => {
      this.handleReject();
    };

    this.contentBox.addChild(this.selectList);
    this.contentBox.addChild(new Spacer(1));
    this.contentBox.addChild(new Text(theme.fg('dim', '上下键选择  Enter 确认  Esc 拒绝'), 0, 0));
  }

  private renderStreaming(): void {
    this.contentBox.clear();
    this.selectList = undefined;
    this.feedbackInput = undefined;
    this.renderPlanHeader();
    this.renderPlanContent();
    this.contentBox.addChild(new Text(theme.fg('dim', '正在提交计划...'), 0, 0));
  }

  private renderPlanHeader(prefix = ''): void {
    this.contentBox.addChild(new Text(`${prefix}${theme.bold(theme.fg('accent', `计划：${this.planTitle}`))}`, 0, 0));
    this.contentBox.addChild(new Spacer(1));
  }

  private renderPlanContent(): void {
    this.contentBox.addChild(new PlanContentBox(this.planContent));
    this.contentBox.addChild(new Spacer(1));
  }

  private renderFeedback(feedback?: string): void {
    if (!feedback) return;
    this.contentBox.addChild(new Text(theme.fg('warning', `修改意见：${feedback}`), 0, 0));
    this.contentBox.addChild(new Spacer(1));
  }

  private handleSelection(value: string): void {
    if (this.resolved) return;

    switch (value) {
      case 'approve':
        this.handleApprove();
        break;
      case 'goal':
        this.handleGoal();
        break;
      case 'reject':
        this.handleReject();
        break;
      case 'edit':
        this.switchToFeedbackMode();
        break;
    }
  }

  private handleApprove(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.showResult('已批准', true);
    this.onApprove?.();
  }

  private handleGoal(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.showResult('已设为目标', true);
    this.onGoal?.();
  }

  private handleReject(feedback?: string): void {
    if (this.resolved) return;
    this.resolved = true;
    this.showResult(feedback ? '已要求修改' : '已拒绝', false, feedback);
    this.onReject?.(feedback);
  }

  private switchToFeedbackMode(): void {
    this.mode = 'feedback';
    this.selectList = undefined;

    this.contentBox.clear();
    this.renderPlanHeader();
    this.renderPlanContent();

    this.contentBox.addChild(new Text(theme.fg('accent', '请输入修改意见：'), 0, 0));
    this.contentBox.addChild(new Spacer(1));

    this.feedbackInput = new Input();
    this.feedbackInput.focused = this._focused;
    this.feedbackInput.onSubmit = (value: string) => {
      const trimmed = value.trim();
      this.handleReject(trimmed || undefined);
    };
    this.feedbackInput.onEscape = () => {
      this.handleReject();
    };

    this.contentBox.addChild(this.feedbackInput);
    this.contentBox.addChild(new Spacer(1));
    this.contentBox.addChild(
      new Text(theme.fg('dim', 'Enter 提交意见  Esc 直接拒绝'), 0, 0),
    );
    this.ui.requestRender(true);
  }

  private showResult(status: string, isApproved: boolean, feedback?: string): void {
    this.contentBox.clear();

    const icon = isApproved ? theme.fg('success', '✓') : theme.fg('error', '✗');
    this.renderPlanHeader();
    this.renderPlanContent();
    this.contentBox.addChild(new Text(`${icon} ${theme.fg('dim', status)}`, 0, 0));
    this.contentBox.addChild(new Spacer(1));
    this.renderFeedback(feedback);
  }

  handleInput(data: string): void {
    if (this.resolved) return;

    if (this.mode === 'feedback' && this.feedbackInput) {
      const kb = getKeybindings();
      if (kb.matches(data, 'tui.select.cancel')) {
        this.handleReject();
        return;
      }
      this.feedbackInput.handleInput(data);
    } else if (this.selectList) {
      this.selectList.handleInput(data);
    }
  }
}

/**
 * Static component for rendering a resolved plan in history.
 * Shows the plan content with approval/rejection status.
 */
export interface PlanResultOptions {
  title: string;
  plan: string;
  isApproved: boolean;
  feedback?: string;
}

export class PlanResultComponent extends Container {
  getChatSpacingKind(): ChatSpacingKind {
    return 'plan';
  }

  constructor(options: PlanResultOptions) {
    super();

    const contentBox = new Box(BOX_INDENT, 0, (text: string) => text);
    this.addChild(contentBox);

    const icon = options.isApproved ? theme.fg('success', '✓') : theme.fg('error', '✗');
    const status = options.isApproved ? '已批准' : options.feedback ? '已要求修改' : '已拒绝';

    contentBox.addChild(new Text(theme.bold(theme.fg('accent', `计划：${options.title}`)), 0, 0));
    contentBox.addChild(new Spacer(1));
    contentBox.addChild(new PlanContentBox(options.plan));
    contentBox.addChild(new Spacer(1));
    contentBox.addChild(new Text(`${icon} ${theme.fg('dim', status)}`, 0, 0));
    contentBox.addChild(new Spacer(1));

    if (options.feedback) {
      contentBox.addChild(new Text(theme.fg('warning', `修改意见：${options.feedback}`), 0, 0));
      contentBox.addChild(new Spacer(1));
    }
  }
}
