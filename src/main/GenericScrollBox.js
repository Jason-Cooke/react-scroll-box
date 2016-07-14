import React from 'react';
import {findDOMNode} from 'react-dom';

const {element, number, bool, func, oneOf, any} = React.PropTypes;

export const FastTrack = {
  PAGING: 'paging',
  GOTO: 'goto',
  OFF: null
};

export class GenericScrollBox extends React.Component {

  static propTypes = {
    children: element.isRequired,

    nativeScroll: bool,
    className: any,

    // Can are be scrolled in corresponding direction.
    scrollableX: bool,
    scrollableY: bool,

    // Hide scrollbar from user.
    showScrollBarX: bool,
    showScrollBarY: bool,

    // Distance from cursor to scroll bar edge when scroll bar is considered to be hovered.
    hoverProximity: number,
    disabled: bool,
    outset: bool,
    scrollMinX: number,
    scrollMinY: number,
    defaultEasing: func,

    // Handle drag
    captureHandleDrag: bool,

    // Events
    onViewportScroll: func,

    // Fast tracking
    fastTrack: oneOf([FastTrack.GOTO, FastTrack.PAGING, FastTrack.OFF]),
    fastTrackDuration: number,

    // Keyboard
    captureKeyboard: bool,
    keyboardStepX: number,
    keyboardStepY: number,
    keyboardScrollDuration: number,

    // Wheel
    captureWheel: bool,
    lineHeight: number,
    wheelStepX: number,
    wheelStepY: number,
    propagateWheelScroll: bool,
    swapWheelAxes: bool,
    wheelScrollDuration: number,

    // Touch
    captureTouch: bool,
    propagateTouchScroll: bool,

    // Layout
    trackXChildren: any,
    trackYChildren: any,
    handleXChildren: any,
    handleYChildren: any
  };

  static defaultProps = {
    nativeScroll: false,
    className: 'scroll-box--wrapped',

    // Can are be scrolled in corresponding direction.
    scrollableX: true,
    scrollableY: true,

    // Hide scrollbar from user.
    showScrollBarX: true,
    showScrollBarY: true,

    // Distance from cursor to scroll bar edge when scroll bar is considered to be hovered.
    hoverProximity: 50,
    disabled: false,
    outset: false,
    scrollMinX: 2,
    scrollMinY: 2,
    defaultEasing: function easeQuadOut(percent, elapsed, min, max, duration) {
      percent -= 1;
      return min + max * Math.sqrt(1 - Math.pow(percent, 2));
    },

    // Handle drag
    captureHandleDrag: true,

    // Events
    onViewportScroll: target => {},

    // Fast tracking
    fastTrack: FastTrack.GOTO,
    fastTrackDuration: 500,

    // Keyboard
    captureKeyboard: true,
    keyboardStepX: 30,
    keyboardStepY: 30,
    keyboardScrollDuration: 200,

    // Wheel
    captureWheel: true,
    lineHeight: 24,
    wheelStepX: 100,
    wheelStepY: 100,
    propagateWheelScroll: false,
    swapWheelAxes: false,
    wheelScrollDuration: 100,

    // Touch
    captureTouch: true,
    propagateTouchScroll: true
  };

  // Handle elements.
  handleXElement = null;
  handleYElement = null;

  // Track elements.
  trackXElement = null;
  trackYElement = null;

  // Viewport element.
  viewportElement = null;

  // Scroll position in pixels that was last requested.
  targetX = 0;
  targetY = 0;

  // Previously requested scroll position.
  previousX = 0;
  previousY = 0;

  // Actual scroll position that user observes.
  // This changes repeatedly during animation, while is static these
  // values are equal to `x` and `y`.
  scrollX = 0;
  scrollY = 0;

  // Maximum values for horizontal and vertical scroll positions.
  scrollMaxX = 0;
  scrollMaxY = 0;

  // Maximum values for horizontal and vertical handle positions. If native scroll is used then equals to 0.
  trackMaxX = 0;
  trackMaxY = 0;

  // Does scroll box require actual presence of horizontal or vertical scroll bars.
  // If set to `true`, then axis is allowed and corresponding `scrollMax >= scrollMin`.
  scrollBarXShowed = false;
  scrollBarYShowed = false;

  _disposed = false;

  // Id of request animation frame that keeps scroll box in sync.
  _forceSyncId = 0;

  // Timestamp when scroll position started to change last time.
  _easingBeginTimestamp = 0;

  // Duration of currently running animation. In case no animation is in progress `_easingDuration` equals to 0.
  _easingDuration = 0;

  _easingFunction = null;

  // If set to `true` prevents triggering `onViewportScroll` if any scrolling occurs.
  // Automatically reset to `false` then scroll animation finishes.
  _silent = false;

  _touchStart = null;
  _touchPrev = null;
  _touchEnd = null;


  _draggingX = false;
  _draggingY = false;

  scrollBy(dx, dy, duration, easing, silent) {
    this.scrollTo(this.targetX + dx, this.targetY + dy, duration, easing, silent);
  }

  scrollTo(x, y, duration = 0, easing = this.props.defaultEasing, silent = false) {
    // Consider actual scroll position to be a starting point.
    this._easingDuration = duration;
    this._easingBeginTimestamp = Date.now();
    this.previousX = this.scrollX;
    this.previousY = this.scrollY;
    if (!isNaN(x)) {
      this.targetX = x;
    }
    if (!isNaN(y)) {
      this.targetY = y;
    }
    this._easingFunction = easing;
    this._silent = Boolean(silent);
    this._forceSync();
  }

  getPageHeight() {
    return this.viewportElement.clientHeight;
  }

  getPageWidth() {
    return this.viewportElement.clientWidth;
  }










  // Synchronize scrollbar positions immediately without waiting for animation frame.
  _forceSync() {
    const {
      scrollableX,
      scrollableY,
      scrollMinX,
      scrollMinY,
      nativeScroll,
      outset,
      onViewportScroll
    } = this.props;

    const {
      handleXElement,
      handleYElement,
      viewportElement,
      scrollY,
      scrollX,
      previousX,
      previousY,
      _silent,
      _easingBeginTimestamp,
      _easingFunction,
      _easingDuration
    } = this;

    const {
      clientWidth,
      clientHeight,
      offsetWidth,
      offsetHeight,
      scrollWidth,
      scrollHeight,
      scrollTop,
      scrollLeft
    } = viewportElement;

    const scrollMaxX = Math.max(0, scrollWidth - clientWidth);
    const scrollMaxY = Math.max(0, scrollHeight - clientHeight);

    this.scrollBarXShowed = scrollableX && scrollMaxX >= scrollMinX;
    this.scrollBarYShowed = scrollableY && scrollMaxY >= scrollMinY;

    this._rootElement.classList.toggle('scroll-box--requires-x', this.scrollBarXShowed);
    this._rootElement.classList.toggle('scroll-box--requires-y', this.scrollBarYShowed);

    // Scrollbars may have non-zero thickness so in case of outset positioning
    // pixes cropped by scrollbar must be compensated.
    let width = '100%',
        height = '100%';
    if (nativeScroll && outset) {
      let trackYWidth = offsetWidth - clientWidth,
          trackXHeight = offsetHeight - clientHeight;
      if (trackYWidth) {
        width = `calc(100% + ${trackYWidth}px)`;
      }
      if (trackXHeight) {
        height = `calc(100% + ${trackXHeight}px)`;
      }
    }
    viewportElement.style.width = width;
    viewportElement.style.height = height;

    let targetX = Math.max(0, Math.min(Math.round(this.targetX), scrollMaxX)) * this.scrollBarXShowed,
        targetY = Math.max(0, Math.min(Math.round(this.targetY), scrollMaxY)) * this.scrollBarYShowed,
        x = targetX,
        y = targetY;

    if (scrollY == scrollTop && scrollX == scrollLeft) {
      let elapsed = Date.now() - _easingBeginTimestamp;
      if (elapsed < _easingDuration && typeof _easingFunction == 'function') {
        let ratio = _easingFunction(elapsed / _easingDuration, elapsed, 0, 1, _easingDuration);

        // Compute eased scroll positions.
        x = Math.round(previousX + ratio * (targetX - previousX));
        y = Math.round(previousY + ratio * (targetY - previousY));
      } else {
        // Scroll animation completed.
        this._easingDuration = 0;
      }
      // Prevent native scrolling glitches, especially if native scroll is inertial or smooth.
      viewportElement.scrollLeft = x;
      viewportElement.scrollTop = y;
    } else {
      // Viewport scroll position is not synced with component state.
      // This is usually caused by system scrolling, resize of element etc.
      // So stop running animation and update component state with current
      // viewport scroll offsets.
      this._easingDuration = 0;
      x = targetX = scrollLeft;
      y = targetY = scrollTop;
    }
    this.targetX = targetX;
    this.targetY = targetY;

    if (scrollX == x && scrollY == y && this.scrollMaxX == scrollMaxX && this.scrollMaxY == scrollMaxY) {
      if (!this._easingDuration) {
        // Animation has completed and geometry did not change.
        this._easingFunction = null;
        this._silent = false;
      }
      // TODO Viewport did not change its scroll parameters, so invocation of `onViewportScroll` and further altering geometry of handles and tracks may not be required.
    }
    this.scrollX = x;
    this.scrollY = y;
    this.scrollMaxX = scrollMaxX;
    this.scrollMaxY = scrollMaxY;
    this.trackMaxX = 0;
    this.trackMaxY = 0;

    // Update custom handle positions and sizes.
    // Scrollbar size represents ratio of content and viewport sizes.
    if (!nativeScroll) {
      this.trackMaxX = this.trackXElement.clientWidth - handleXElement.offsetWidth;
      this.trackMaxY = this.trackYElement.clientHeight - handleYElement.offsetHeight;

      handleXElement.style.width = clientWidth / scrollWidth * 100 + '%';
      handleXElement.style.left = this.trackMaxX * x / scrollMaxX + 'px';

      handleYElement.style.height = clientHeight / scrollHeight * 100 + '%';
      handleYElement.style.top = this.trackMaxY * y / scrollMaxY + 'px';
    }
    if (!_silent && !(scrollX == x && scrollY == y)) {
      onViewportScroll(this);
    }
  }

  _requestForceSync = () => {
    if (window.cancelAnimationFrame) {
      this._forceSyncId = requestAnimationFrame(this._requestForceSync);
    } else {
      this._forceSyncId = setTimeout(this._requestForceSync, 1000 / 30);
    }
    this._forceSync();
  };










  onTouchStart = e => {
    const {disabled, captureTouch, propagateTouchScroll} = this.props,
          {scrollBarXShowed, scrollBarYShowed} = this;
    if (
      disabled || e.isDefaultPrevented() || // Event prevented.
      !captureTouch || // Touch events prevented.
      e.touches.length > 1 || // Scroll only with one touch.
      (!scrollBarXShowed && !scrollBarYShowed)
    ) {
      return;
    }
    if (!propagateTouchScroll) {
      e.stopPropagation();
    }
    const touch = e.touches[0],
          {scrollLeft, scrollTop} = this.viewportElement;

    this._touchInitialScrollLeft = scrollLeft;
    this._touchInitialScrollTop = scrollTop;

    this._touchStart = {x: touch.pageX, y: touch.pageY};
    this._touchPrev = {...this._touchStart};
  };

  onTouchMove = e => {
    const {propagateTouchScroll, nativeScroll} = this.props,
          {targetX, targetY, scrollMaxX, scrollMaxY, _touchStart, _touchEnd} = this;
    if (!_touchStart) {
      return;
    }
    const touch = e.touches[0];
    if (_touchEnd) {
      this._touchPrev.x = _touchEnd.x;
      this._touchPrev.y = _touchEnd.y;
    } else {
      this._touchEnd = {};
    }
    this._touchEnd.x = touch.pageX;
    this._touchEnd.y = touch.pageY;

    const dx = this._touchPrev.x - this._touchEnd.x,
          dy = this._touchPrev.y - this._touchEnd.y;
    if (
      !(
        (dx < 0 && !targetX) || (dx > 0 && targetX == scrollMaxX) ||
        (dy < 0 && !targetY) || (dy > 0 && targetY == scrollMaxY)
      )
    ) {
      e.preventDefault();
    }

    // Content is scrolled to its possible limit.
    if (!propagateTouchScroll) {
      e.stopPropagation();
    }
    if (!nativeScroll) {
      this.scrollTo(
        _touchStart.x - this._touchEnd.x + this._touchInitialScrollLeft,
        _touchStart.y - this._touchEnd.y + this._touchInitialScrollTop,
        0
      );
    }
  };

  onTouchEnd = e => {
    // const {_touchPrev, _touchEnd} = this;
    // if (!_touchEnd) {
    //   return;
    // }
    // const {scrollLeft, scrollTop} = this.viewportElement;
    //
    // let dt = Date.now() - this._easingBeginTimestamp,
    //     dx = _touchPrev.x - _touchEnd.x,
    //     dy = _touchPrev.y - _touchEnd.y,
    //     distance = Math.sqrt(dx * dx + dy * dy),
    //     velocity = distance / dt * 100;
    //
    //
    // console.log(dx, dy, dt)

    this._touchStart = null;
    this._touchPrev = null;
    this._touchEnd = null;
    // this.scrollTo(scrollLeft - velocity * dx / distance, scrollTop - velocity * dy / distance, velocity);
  };






  _handleWheel = event => {
    let {target, deltaMode, deltaX, deltaY, shiftKey} = event;

    const {
      wheelStepX,
      wheelStepY,
      disabled,
      nativeScroll,
      captureWheel,
      lineHeight,
      propagateWheelScroll,
      swapWheelAxes,
      wheelScrollDuration
    } = this.props;

    const {
      targetX,
      targetY,
      scrollX,
      scrollY,
      scrollMaxX,
      scrollMaxY,
      scrollBarXShowed,
      scrollBarYShowed,
      viewportElement,
      _easingBeginTimestamp
    } = this;

    if (nativeScroll && !captureWheel) {
      event.preventDefault();
    }
    if (disabled || event.isDefaultPrevented()) {
      return;
    }
    if (target !== viewportElement && target.tagName === 'TEXTAREA') {
      // Nested textarea is focused and its is not a viewport.
      return;
    }

    // By default, Google Chrome changes scrolling orientation if shift key is pressed,
    // so propagate this behavior to other browsers as well.
    if (shiftKey && deltaX === 0) {
      deltaX = deltaY;
      deltaY = 0;
    }

    if (swapWheelAxes) {
      const buffer = deltaX;
      deltaX = deltaY;
      deltaY = buffer;
    }

    let dx = deltaX * scrollBarXShowed,
        dy = deltaY * scrollBarYShowed;
    if (
      (deltaX && !scrollBarXShowed) || (dx < 0 && !targetX) || (dx > 0 && targetX == scrollMaxX) ||
      (deltaY && !scrollBarYShowed) || (dy < 0 && !targetY) || (dy > 0 && targetY == scrollMaxY)
    ) {
      // Content is scrolled to its possible limit.
      if (!propagateWheelScroll) {
        event.preventDefault();
      }
      return;
    }
    event.preventDefault();

    // Converts received delta values into pixels.
    switch (deltaMode) {

      case 0x01: // Delta values are specified in lines.
        dx *= lineHeight;
        dy *= lineHeight;
        break;

      case 0x02:
        dx *= this.getPageWidth();
        dy *= this.getPageHeight();
        break;

      default:
        // Delta values are specified in pixels.
        break;
    }

    dx *= wheelStepX / 100;
    dy *= wheelStepY / 100;

    let nextTargetX = targetX + dx;
    let nextTargetY = targetY + dy;

    // Prevent jumping to target position when animated scrolling is in progress,
    // but preserve scroll speed when mouse wheel events arrive frequently.
    if (Date.now() - _easingBeginTimestamp > wheelScrollDuration) {
      nextTargetX = scrollX + dx;
      nextTargetY = scrollY + dy;
    }
    this.scrollTo(nextTargetX, nextTargetY, wheelScrollDuration);
  };

  _handleKeyDown = event => {
    const {
      target: {tagName},
      keyCode,
      shiftKey
    } = event;

    const {
      disabled,
      captureKeyboard,
      keyboardStepX,
      keyboardStepY,
      keyboardScrollDuration
    } = this.props;

    if (disabled || !captureKeyboard) {
      return;
    }

    if (tagName === 'TEXTAREA' || tagName == 'INPUT') {
      // Do not handle any keyboard events when text-related controls are focused.
      return;
    }

    switch (keyCode) {

      case 36: // Home
        event.preventDefault();
        this.scrollTo(undefined, 0, keyboardScrollDuration);
        break;

      case 35: // End
        event.preventDefault();
        this.scrollTo(undefined, this.scrollMaxY, keyboardScrollDuration);
        break;

      case 33: // Page Up
      case 34: // Page Down
        event.preventDefault();
        let dy = this.getPageHeight(),
            dx = this.getPageWidth();

        if (keyCode == 33) { // Page Up
          dy *= -1;
          dx *= -1;
        }
        if (shiftKey) {
          this.scrollBy(dx, 0, keyboardScrollDuration);
        } else {
          this.scrollBy(0, dy, keyboardScrollDuration);
        }
        break;

      case 38: // Up
        event.preventDefault();
        this.scrollBy(0, -keyboardStepY, keyboardScrollDuration);
        break;

      case 40: // Down
        event.preventDefault();
        this.scrollBy(0, keyboardStepY, keyboardScrollDuration);
        break;

      case 37: // Left
        event.preventDefault();
        this.scrollBy(-keyboardStepX, 0, keyboardScrollDuration);
        break;

      case 39: // Right
        event.preventDefault();
        this.scrollBy(keyboardStepX, 0, keyboardScrollDuration);
        break;
    }
  };

  _handleDragStart(event, isHorizontal) {
    const {
      disabled,
      captureHandleDrag
    } = this.props;

    if (disabled || !captureHandleDrag || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    let targetTrackElement;
    if (isHorizontal) {
      this._draggingX = true;
      targetTrackElement = this.trackXElement;
    } else {
      this._draggingY = true;
      targetTrackElement = this.trackYElement;
    }

    const offsetX = event.clientX - this.handleXElement.offsetLeft;
    const offsetY = event.clientY - this.handleYElement.offsetTop;

    let onDrag = event => {
      if (this._disposed || event.button !== 0) {
        // Component was unmounted or button was released.
        onDragEnd();
      }
      if (isHorizontal) {
        var nextTargetX = this.scrollMaxX * (event.clientX - offsetX) / this.trackMaxX;
      } else {
        var nextTargetY = this.scrollMaxY * (event.clientY - offsetY) / this.trackMaxY;
      }
      this.scrollTo(nextTargetX, nextTargetY, 0);
    };

    let onDragEnd = () => {
      this._draggingX = false;
      this._draggingY = false;
      removeEventListener('mousemove', onDrag);
      removeEventListener('mouseup', onDragEnd);

      if (!this._disposed) {
        targetTrackElement.classList.remove('scroll-box__track--dragged');
      }
    };

    addEventListener('mousemove', onDrag);
    addEventListener('mouseup', onDragEnd);

    targetTrackElement.classList.add('scroll-box__track--dragged');
  };

  _handleDragStartX = event => this._handleDragStart(event, true);

  _handleDragStartY = event => this._handleDragStart(event, false);

  _handleFastTrack(event, isHorizontal) {
    const {
      disabled,
      fastTrack,
      fastTrackDuration
    } = this.props;

    if (disabled || event.button !== 0) {
      return; // Component is disabled or secondary mouse button is being pressed.
    }

    const {
      clientWidth,
      clientHeight,
      scrollWidth,
      scrollHeight
    } = this.viewportElement;

    const pointerX = event.clientX - this.trackXElement.getBoundingClientRect().left;
    const pointerY = event.clientY - this.trackYElement.getBoundingClientRect().top;

    let nextTargetX, nextTargetY;

    switch (fastTrack) {

      case FastTrack.PAGING:
        if (isHorizontal) {
          nextTargetX = this.targetX + (1 - 2 * (pointerX < this.handleXElement.offsetLeft)) * this.getPageWidth();
        } else {
          nextTargetY = this.targetY + (1 - 2 * (pointerY < this.handleYElement.offsetTop)) * this.getPageHeight();
        }
        break;

      case FastTrack.GOTO:
        if (isHorizontal) {
          nextTargetX = pointerX / this.trackXElement.clientWidth * scrollWidth - clientWidth / 2;
        } else {
          nextTargetY = pointerY / this.trackYElement.clientHeight * scrollHeight - clientHeight / 2;
        }
        break;

      default: return;
    }

    this.scrollTo(nextTargetX, nextTargetY, fastTrackDuration);
  };

  _handleFastTrackX = event => this._handleFastTrack(event, true);

  _handleFastTrackY = event => this._handleFastTrack(event, false);

  _updateTrackHoverStatus(event, trackElement, forceStatus) {
    let status = forceStatus;

    if (status == null) {
      const {clientX, clientY} = event,
            {hoverProximity} = this.props,
            {width, left, top, height} = trackElement.getBoundingClientRect();
      status = (
        clientY - height - top < hoverProximity && top  - clientY < hoverProximity &&
        clientX - width - left < hoverProximity && left - clientX < hoverProximity
      );
    }
    trackElement.classList.toggle('scroll-box__track--hover', status);
  }

  _handleCursorApproachingTrack = event => {
    const {
      disabled,
      nativeScroll,
      captureHandleDrag,
      fastTrack
    } = this.props;

    const {trackXElement, trackYElement} = this;

    if (window.orientation || nativeScroll || disabled || (!captureHandleDrag && fastTrack == FastTrack.OFF)) {
      return;
    }

    if (event.buttons > 0) {
      // Remove hover status mouse with pressed button is being dragged
      // but no handle dragging is in progress.
      if (!this._draggingX) {
        this._updateTrackHoverStatus(event, trackXElement, false);
      }
      if (!this._draggingY) {
        this._updateTrackHoverStatus(event, trackYElement, false);
      }
      return;
    }

    // Update track hover status only if it is actually in use.
    if (this.scrollBarXShowed) {
      this._updateTrackHoverStatus(event, trackXElement);
    }
    if (this.scrollBarYShowed) {
      this._updateTrackHoverStatus(event, trackYElement);
    }
  };

  _updateReferences() {
    this._rootElement = findDOMNode(this);
    this.viewportElement = this._rootElement.firstChild;

    const {trackX, trackY, handleX, handleY} = this.refs;
    this.trackXElement  = findDOMNode(trackX);
    this.trackYElement  = findDOMNode(trackY);
    this.handleXElement = findDOMNode(handleX);
    this.handleYElement = findDOMNode(handleY);

    // Detect native scroll status.
    const {nativeScroll} = this.props;
    if (nativeScroll == null) {
      if (window.orientation) {
        this._rootElement.classList.add('scroll-box--native');
      }
    } else {
      this._rootElement.classList.toggle('scroll-box--native', nativeScroll);
    }
  }

  componentDidMount() {
    this._updateReferences();
    this._requestForceSync();
    addEventListener('mousemove', this._handleCursorApproachingTrack);
  }

  componentDidUpdate() {
    this._updateReferences();
    this._forceSync();
  }

  componentWillUnmount() {
    if (window.cancelAnimationFrame) {
      cancelAnimationFrame(this._forceSyncId);
    } else {
      clearTimeout(this._forceSyncId);
    }
    this._forceSyncId = undefined;
    removeEventListener('mousemove', this._handleCursorApproachingTrack);
  }

  render() {
    const {
      scrollableX,
      scrollableY,
      showScrollBarX,
      showScrollBarY,
      trackXChildren,
      trackYChildren,
      handleXChildren,
      handleYChildren,
      disabled,
      outset,
      className,
      children,
      style
    } = this.props;

    let classNames = ['scroll-box'];
    if (className) {
      classNames = classNames.concat(className);
    }
    if (disabled) {
      classNames.push('scroll-box--disabled');
    }
    if (outset) {
      classNames.push('scroll-box--outset');
    }
    if (scrollableX && showScrollBarX) {
      classNames.push('scroll-box--allow-x');
    }
    if (scrollableY && showScrollBarY) {
      classNames.push('scroll-box--allow-y');
    }

    return (
      <div style={style}
           className={classNames.join(' ')}
           onWheel={this._handleWheel}
           onKeyDown={this._handleKeyDown}
           onTouchStart={this.onTouchStart}
           onTouchMove={this.onTouchMove}
           onTouchEnd={this.onTouchEnd}
           onTouchCancel={this.onTouchEnd}
           tabIndex="-1">
        {children}
        <div className="scroll-box__track scroll-box__track--x"
             onMouseDown={this._handleFastTrackX}
             ref="trackX">
          <div className="scroll-box__handle scroll-box__handle--x"
               onMouseDown={this._handleDragStartX}
               ref="handleX">
            {handleXChildren}
          </div>
          {trackXChildren}
        </div>
        <div className="scroll-box__track scroll-box__track--y"
             onMouseDown={this._handleFastTrackY}
             ref="trackY">
          <div className="scroll-box__handle scroll-box__handle--y"
               onMouseDown={this._handleDragStartY}
               ref="handleY">
            {handleYChildren}
          </div>
          {trackYChildren}
        </div>
      </div>
    );
  }
}
