import { Component, ComponentInterface, Element, Event, EventEmitter, Host, Method, Prop, Watch, h } from '@stencil/core';

import { getIonMode } from '../../global/ionic-global';
import { AnimationBuilder, ComponentProps, ComponentRef, FrameworkDelegate, OverlayEventDetail, OverlayInterface, PopoverSize, PositionAlign, PositionReference, PositionSide, TriggerAction } from '../../interface';
import { attachComponent, detachComponent } from '../../utils/framework-delegate';
import { addEventListener } from '../../utils/helpers';
import { BACKDROP, dismiss, eventMethod, prepareOverlay, present } from '../../utils/overlays';
import { getClassMap } from '../../utils/theme';
import { deepReady } from '../../utils/transition';

import { iosEnterAnimation } from './animations/ios.enter';
import { iosLeaveAnimation } from './animations/ios.leave';
import { mdEnterAnimation } from './animations/md.enter';
import { mdLeaveAnimation } from './animations/md.leave';
import { configureTriggerInteraction } from './utils';

const CoreDelegate = () => {
  let Cmp: any;
  const attachViewToDom = (parentElement: HTMLElement, _: any, _2: any = {}, _3?: string[]) => {
    Cmp = parentElement.closest('ion-popover');
    const app = document.querySelector('ion-app') || document.body;

    if (app && Cmp) {
      app.appendChild(Cmp);
    }

    return Cmp;
  }

  const removeViewFromDom = () => {
    if (Cmp) {
      Cmp.remove();
    }
    return Promise.resolve();
  }

  return { attachViewToDom, removeViewFromDom }
}

/**
 * @virtualProp {"ios" | "md"} mode - The mode determines which platform styles to use.
 */
@Component({
  tag: 'ion-popover',
  styleUrls: {
    ios: 'popover.ios.scss',
    md: 'popover.md.scss'
  },
  scoped: true
})
export class Popover implements ComponentInterface, OverlayInterface {

  private usersElement?: HTMLElement;
  private triggerEl?: HTMLElement | null;
  private parentPopover: HTMLIonPopoverElement | null = null;
  private popoverId = `ion-popover-${popoverIds++}`;
  private destroyTriggerInteraction?: () => void;

  presented = false;
  lastFocus?: HTMLElement;

  @Element() el!: HTMLIonPopoverElement;

  /** @internal */
  @Prop() delegate?: FrameworkDelegate = CoreDelegate();

  /** @internal */
  @Prop() overlayIndex!: number;

  /**
   * Animation to use when the popover is presented.
   */
  @Prop() enterAnimation?: AnimationBuilder;

  /**
   * Animation to use when the popover is dismissed.
   */
  @Prop() leaveAnimation?: AnimationBuilder;

  /**
   * The component to display inside of the popover.
   * @internal
   */
  @Prop() component!: ComponentRef;

  /**
   * The data to pass to the popover component.
   * @internal
   */
  @Prop() componentProps?: ComponentProps;

  /**
   * If `true`, the keyboard will be automatically dismissed when the overlay is presented.
   */
  @Prop() keyboardClose = true;

  /**
   * Additional classes to apply for custom CSS. If multiple classes are
   * provided they should be separated by spaces.
   * @internal
   */
  @Prop() cssClass?: string | string[];

  /**
   * If `true`, the popover will be dismissed when the backdrop is clicked.
   */
  @Prop() backdropDismiss = true;

  /**
   * The event to pass to the popover animation.
   */
  @Prop() event: any;

  /**
   * If `true`, a backdrop will be displayed behind the popover.
   */
  @Prop() showBackdrop = true;

  /**
   * If `true`, the popover will be translucent.
   * Only applies when the mode is `"ios"` and the device supports
   * [`backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter#Browser_compatibility).
   */
  @Prop() translucent = false;

  /**
   * If `true`, the popover will animate.
   */
  @Prop() animated = true;

  /**
   * Describes what kind of interaction with the trigger that
   * should cause the popover to open. Does not apply when the `trigger`
   * property is `undefined`.
   * If `'click'`, the popover will be presented when the trigger is left clicked.
   * If `'hover'`, the popover will be presented when a pointer hovers over the trigger.
   * If `'context-menu'`, the popover will be presented when the trigger is right
   * clicked on desktop and long pressed on mobile. This will also prevent your
   * device's normal context menu from appearing.
   */
  @Prop() triggerAction: TriggerAction = 'click';

  /**
   * An ID corresponding to the trigger element that
   * causes the popover to open. Use the `trigger-action`
   * property to customize the interaction that results in
   * the popover opening.
   */
  @Prop() trigger: string | undefined;

  /**
   * Describes how to calculate the popover width.
   * If `'cover'`, the popover width will match the width of the trigger.
   * If `'auto'`, the popover width will be determined by the content in
   * the popover.
   */
  @Prop() size: PopoverSize = 'auto';

  /**
   * If `true`, the popover will be automatically
   * dismissed when the content has been clicked.
   */
  @Prop() dismissOnSelect = false;

  /**
   * Describes what to position the popover relative to.
   * If `'trigger'`, the popover will be positioned relative
   * to the trigger button. If passing in an event, this is
   * determined via event.target.
   * If `'event'`, the popover will be positioned relative
   * to the x/y coordinates of the trigger action. If passing
   * in an event, this is determined via event.clientX and event.clientY.
   */
  @Prop() reference: PositionReference = 'trigger';

  /**
   * Describes which side of the `reference` point to position
   * the popover on. The `'start'` and `'end'` values are RTL-aware,
   * and the `'left'` and `'right'` values are not.
   */
  @Prop() side: PositionSide = 'bottom';

  /**
   * Describes how to align the popover content with the `reference` point.
   */
  @Prop() align: PositionAlign = 'start';

  @Watch('trigger')
  @Watch('triggerAction')
  onTriggerChange() {
    this.configureTriggerInteraction();
  }

  /**
   * Emitted after the popover has presented.
   */
  @Event({ eventName: 'ionPopoverDidPresent' }) didPresent!: EventEmitter<void>;

  /**
   * Emitted before the popover has presented.
   */
  @Event({ eventName: 'ionPopoverWillPresent' }) willPresent!: EventEmitter<void>;

  /**
   * Emitted before the popover has dismissed.
   */
  @Event({ eventName: 'ionPopoverWillDismiss' }) willDismiss!: EventEmitter<OverlayEventDetail>;

  /**
   * Emitted after the popover has dismissed.
   */
  @Event({ eventName: 'ionPopoverDidDismiss' }) didDismiss!: EventEmitter<OverlayEventDetail>;

  connectedCallback() {
    prepareOverlay(this.el);
  }

  componentDidLoad() {
    const parentPopover = this.parentPopover = this.el.closest(`ion-popover:not(#${this.popoverId})`) as HTMLIonPopoverElement | null;

    if (parentPopover) {
      addEventListener(parentPopover, 'ionPopoverWillDismiss', () => {
        this.dismiss(undefined, undefined, false);
      });
    }

    this.configureTriggerInteraction();
  }

  /**
   * Present the popover overlay after it has been created.
   */
  @Method()
  async present(event?: any): Promise<void> {
    if (this.presented) {
      return;
    }
    const container = this.el.querySelector('.popover-content');
    if (!container) {
      throw new Error('container is undefined');
    }
    const data = {
      ...this.componentProps,
      popover: this.el
    };

    this.usersElement = await attachComponent(this.delegate, container, this.component, ['popover-viewport', (this.el as any)['s-sc']], data);
    await deepReady(this.usersElement);
    return present(this, 'popoverEnter', iosEnterAnimation, mdEnterAnimation, {
      event: this.event || event,
      size: this.size,
      trigger: this.triggerEl,
      reference: this.reference,
      side: this.side,
      align: this.align
    });
  }

  /**
   * Dismiss the popover overlay after it has been presented.
   *
   * @param data Any data to emit in the dismiss events.
   * @param role The role of the element that is dismissing the popover. For example, 'cancel' or 'backdrop'.
   * @param dismissParentPopover If `true`, dismissing this popover will also dismiss
   * a parent popover if this popover is nested. Defaults to `true`.
   */
  @Method()
  async dismiss(data?: any, role?: string, dismissParentPopover = true): Promise<boolean> {
    if (dismissParentPopover && this.parentPopover) {
      this.parentPopover.dismiss(data, role, dismissParentPopover)
    }

    const shouldDismiss = await dismiss(this, data, role, 'popoverLeave', iosLeaveAnimation, mdLeaveAnimation, this.event);
    if (shouldDismiss) {
      await detachComponent(this.delegate, this.usersElement);
    }
    return shouldDismiss;
  }

  /**
   * Returns a promise that resolves when the popover did dismiss.
   */
  @Method()
  onDidDismiss<T = any>(): Promise<OverlayEventDetail<T>> {
    return eventMethod(this.el, 'ionPopoverDidDismiss');
  }

  /**
   * Returns a promise that resolves when the popover will dismiss.
   */
  @Method()
  onWillDismiss<T = any>(): Promise<OverlayEventDetail<T>> {
    return eventMethod(this.el, 'ionPopoverWillDismiss');
  }

  /**
   * @internal
   */
  @Method()
  async getParentPopover(): Promise<HTMLIonPopoverElement | null> {
    return this.parentPopover;
  }

  private onDismiss = (ev: UIEvent) => {
    ev.stopPropagation();
    ev.preventDefault();

    this.dismiss();
  }

  private onBackdropTap = () => {
    this.dismiss(undefined, BACKDROP);
  }

  private onLifecycle = (modalEvent: CustomEvent) => {
    const el = this.usersElement;
    const name = LIFECYCLE_MAP[modalEvent.type];
    if (el && name) {
      const event = new CustomEvent(name, {
        bubbles: false,
        cancelable: false,
        detail: modalEvent.detail
      });
      el.dispatchEvent(event);
    }
  }
  private configureTriggerInteraction = () => {
    const { trigger, triggerAction, el, destroyTriggerInteraction } = this;

    if (destroyTriggerInteraction) {
      destroyTriggerInteraction();
    }

    const triggerEl = this.triggerEl = (trigger !== undefined) ? document.getElementById(trigger) : null;
    if (!triggerEl) { return; }

    this.destroyTriggerInteraction = configureTriggerInteraction(triggerEl, triggerAction, el);
  }

  render() {
    const mode = getIonMode(this);
    const { onLifecycle, popoverId, parentPopover, dismissOnSelect } = this;

    return (
      <Host
        aria-modal="true"
        no-router
        tabindex="-1"
        style={{
          zIndex: `${20000 + this.overlayIndex}`,
        }}
        id={popoverId}
        class={{
          ...getClassMap(this.cssClass),
          [mode]: true,
          'popover-translucent': this.translucent,
          'overlay-hidden': true
        }}
        onIonPopoverDidPresent={onLifecycle}
        onIonPopoverWillPresent={onLifecycle}
        onIonPopoverWillDismiss={onLifecycle}
        onIonPopoverDidDismiss={onLifecycle}
        onIonDismiss={this.onDismiss}
        onIonBackdropTap={this.onBackdropTap}
      >
        {!parentPopover && <ion-backdrop tappable={this.backdropDismiss} visible={this.showBackdrop} />}

        <div tabindex="0"></div>

        <div class="popover-wrapper ion-overlay-wrapper">
          <div class="popover-arrow"></div>
          {/* TODO: how do we exclude trigger elements from onClick handler? */}

          <div
            class="popover-content"
            onClick={dismissOnSelect ? () => this.dismiss() : undefined}
          >
            <slot></slot>
          </div>
        </div>

        <div tabindex="0"></div>
      </Host>
    );
  }
}

const LIFECYCLE_MAP: any = {
  'ionPopoverDidPresent': 'ionViewDidEnter',
  'ionPopoverWillPresent': 'ionViewWillEnter',
  'ionPopoverWillDismiss': 'ionViewWillLeave',
  'ionPopoverDidDismiss': 'ionViewDidLeave',
};

let popoverIds = 0;
