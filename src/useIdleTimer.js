/**
 *  ___    _ _     _____ _
 * |_ _|__| | | __|_   _(_)_ __ ___   ___ _ __
 *  | |/ _` | |/ _ \| | | | '_ ` _ \ / _ \ '__|
 *  | | (_| | |  __/| | | | | | | | |  __/ |
 * |___\__,_|_|\___||_| |_|_| |_| |_|\___|_|
 *
 * @name useIdleTimer
 * @author Randy Lebeau
 * @private
 */

import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { TabManager } from './TabManager'
import { IS_BROWSER, DEFAULT_ELEMENT, DEFAULT_EVENTS, debounced, throttled } from './utils'

/**
 * Detects when your user is idle
 * @function useIdleTimer
 * @private
 */
function useIdleTimer ({
  timeout = 1000 * 60 * 20,
  element = DEFAULT_ELEMENT,
  events = DEFAULT_EVENTS,
  onIdle = () => {},
  onActive = () => {},
  onAction = () => {},
  debounce = 0,
  throttle = 0,
  eventsThrottle = 200,
  startOnMount = true,
  startManually = false,
  stopOnIdle = false,
  capture = true,
  passive = true,
  crossTab = false
} = {}) {
  const eventsBound = useRef(false)
  const idle = useRef(true)
  const oldDate = useRef(+new Date())
  const remaining = useRef(null)
  const pageX = useRef(null)
  const pageY = useRef(null)
  const tId = useRef(null)
  const lastActive = useRef(null)
  const lastIdle = useRef(null)
  const idleTime = useRef(0)
  const firstLoad = useRef(true)
  const _timeout = useRef(timeout)

  // Tab manager reference
  let manager
  if (crossTab) {
    if (crossTab === true) crossTab = {}
    crossTab = Object.assign(crossTab, {
      channelName: 'idle-timer',
      fallbackInterval: 2000,
      responseTime: 100,
      removeTimeout: 1000 * 60
    })
  }

  // Event emitters
  const emitOnIdle = useRef(onIdle)
  const emitOnActive = useRef(onActive)
  const emitOnAction = useRef(onAction)

  /**
   * Toggles the idle state and calls
   * the correct action function
   * @private
   */
  const _toggleIdleState = e => {
    const nextIdle = !idle.current
    idle.current = nextIdle
    if (nextIdle) {
      if (stopOnIdle) {
        // Clear any existing timeout
        clearTimeout(tId.current)
        tId.current = null
        // Unbind events
        _unbindEvents()
      }
      lastIdle.current = (+new Date()) - _timeout.current
      if (manager) {
        if (manager.isLeader()) {
          manager.idle()
        } else {
          manager.send('idle')
        }
      } else {
        emitOnIdle.current(e)
      }
    } else {
      idleTime.current += (+new Date()) - lastIdle.current
      _bindEvents()
      if (manager) {
        if (manager.isLeader()) {
          manager.active()
        } else {
          manager.send('active')
        }
      } else {
        emitOnActive.current(e)
      }
    }
  }

  /**
   * Event handler
   * @param {Event} e
   */
  const _handleEvent = e => {
    // Fire onAction event
    emitOnAction.current(e)

    // Already active, ignore events
    if (remaining.current) return

    // Mousemove event
    if (e.type === 'mousemove') {
      // If coords are same, it didn't move
      if (e.pageX === pageX && e.pageY === pageY) {
        return
      }
      // If coords don't exist how could it move
      if (typeof e.pageX === 'undefined' && typeof e.pageY === 'undefined') {
        return
      }
      // Under 200 ms is hard to do
      // continuous activity will bypass this
      const elapsed = getElapsedTime()
      if (elapsed < 200) {
        return
      }
    }

    // Clear any existing timeout
    clearTimeout(tId.current)
    tId.current = null

    // Determine last time User was active, as can't rely on setTimeout ticking at the correct interval
    const elapsedTimeSinceLastActive = +new Date() - getLastActiveTime()

    // If the user is idle or last active time is more than timeout, flip the idle state
    if (
      (idle.current && !stopOnIdle) ||
      (!idle.current && elapsedTimeSinceLastActive > _timeout.current)
    ) {
      _toggleIdleState(e)
    }

    // Store when the user was last active
    // and update the mouse coordinates
    lastActive.current = +new Date()
    pageX.current = e.pageX
    pageY.current = e.pageY

    // If the user is idle and stopOnIdle flag is not set
    // set a new timeout
    if (idle.current) {
      if (!stopOnIdle) {
        tId.current = setTimeout(_toggleIdleState, _timeout.current)
      }
    } else {
      tId.current = setTimeout(_toggleIdleState, _timeout.current)
    }
  }

  /**
   * Reference to current handleEvent function.
   * @private
   */
  const handleEvent = useRef(_handleEvent)

  /**
   * Binds the specified events
   * @private
   */
  const _bindEvents = () => {
    // Don't bind events if
    // we are not in a browser
    if (!IS_BROWSER) return
    // Otherwise we bind all the events
    // to the supplied element
    if (!eventsBound.current) {
      events.forEach(e => {
        element.addEventListener(e, handleEvent.current, {
          capture,
          passive
        })
      })
      eventsBound.current = true
    }
  }

  /**
   * Unbinds all the bound events
   * @private
   */
  const _unbindEvents = (force = false) => {
    // If we are not in a browser
    // we don't need to unbind events
    if (!IS_BROWSER) return
    // Unbind all events
    if (eventsBound.current || force) {
      events.forEach(e => {
        element.removeEventListener(e, handleEvent.current, {
          capture,
          passive
        })
      })
      eventsBound.current = false
    }
  }

  /**
   * Time remaining before idle
   * @name getRemainingTime
   * @return {number} Milliseconds remaining
   */
  const getRemainingTime = () => {
    // If idle there is no time remaining
    if (remaining.current !== null) {
      return remaining.current < 0 ? 0 : remaining.current
    }

    // Determine remaining, if negative idle didn't finish flipping, just return 0
    const timeLeft = _timeout.current - ((+new Date()) - lastActive.current)
    return timeLeft < 0 ? 0 : timeLeft
  }

  /**
   * How much time has elapsed
   * @name getElapsedTime
   * @return {Timestamp}
   */
  const getElapsedTime = () => (+new Date()) - oldDate.current

  /**
   * Last time the user was idle
   * @name getLastIdleTime
   * @return {Timestamp}
   */
  const getLastIdleTime = () => lastIdle.current

  /**
   * Get the total time user is idle
   * @name getTotalIdleTime
   * @return {number} Milliseconds idle
   */
  const getTotalIdleTime = () => {
    if (idle.current) {
      return ((+new Date()) - lastIdle.current) + idleTime.current
    } else {
      return idleTime.current
    }
  }

  /**
   * Last time the user was active
   * @name getLastActiveTime
   * @return {Timestamp}
   */
  const getLastActiveTime = () => lastActive.current

  /**
   * Get the total time user is active
   * @name getTotalActiveTime
   * @return {number} Milliseconds active
   */
  const getTotalActiveTime = () => getElapsedTime() - getTotalIdleTime()

  /**
   * Returns wether or not the user is idle
   * @name isIdle
   * @return {Boolean}
   */
  const isIdle = () => idle.current

  /**
   * Returns wether or not this is the leader tab
   * @returns {Boolean}
   */
  const isLeader = () => manager ? manager.isLeader() : true

  /**
  * Restore initial state and restart timer
  * @name reset
  */
  const reset = () => {
    // Clear timeout
    clearTimeout(tId.current)
    tId.current = null

    // Bind the events
    _bindEvents()

    // Reset state
    idle.current = false
    oldDate.current = +new Date()
    lastActive.current = +new Date()
    remaining.current = null

    if (manager) manager.setAllIdle(false)

    // Set new timeout
    tId.current = setTimeout(_toggleIdleState, _timeout.current)
  }

  /**
   * Store remaining time and stop timer
   * @name pause
   */
  const pause = () => {
    // Timer is already paused
    if (remaining.current !== null) return

    // Unbind events
    _unbindEvents()

    // Clear existing timeout
    clearTimeout(tId.current)
    tId.current = null

    // Define how much is left on the timer
    remaining.current = getRemainingTime()
  }

  /**
   * Resumes a paused timer
   * @name resume
   */
  const resume = () => {
    // Timer is not paused
    if (remaining.current === null) return

    // Bind events
    _bindEvents()

    // Start timer and clear remaining
    // if we are in the idle state
    if (!idle.current) {
      // Set a new timeout
      tId.current = setTimeout(_toggleIdleState, remaining.current)
      // Set states
      remaining.current = null
      lastActive.current = +new Date()
    }
  }

  /**
   * Hook lifecycle
   */
  useEffect(() => {
    // Debounce and throttle can't both be set
    if (debounce > 0 && throttle > 0) {
      throw new Error('onAction can either be throttled or debounced (not both)')
    }

    // Create a throttle event handler if applicable
    if (eventsThrottle > 0) {
      handleEvent.current = throttled(_handleEvent, eventsThrottle)
    }

    // Set up cross tab
    if (crossTab) {
      manager = TabManager({
        type: crossTab.type,
        channelName: crossTab.channelName,
        fallbackInterval: crossTab.fallbackInterval,
        responseTime: crossTab.responseTime,
        onIdle: emitOnIdle.current,
        onActive: emitOnActive.current
      })
      manager.send('register')
    }

    // If startOnMount is enabled, start the timer
    if (startManually) {
      return async () => {
        clearTimeout(tId.current)
        _unbindEvents(true)
        if (crossTab) await manager.close()
      }
    }

    if (startOnMount) {
      reset()
    } else {
      _bindEvents()
    }

    // Clear and unbind on unmount
    return async () => {
      clearTimeout(tId.current)
      _unbindEvents(true)
      if (crossTab) await manager.close()
    }
  }, [])

  useEffect(() => {
    emitOnIdle.current = onIdle
  }, [onIdle])

  useEffect(() => {
    emitOnActive.current = onActive
  }, [onActive])

  useEffect(() => {
    // Create debounced action if applicable
    if (debounce > 0) {
      emitOnAction.current = debounced(onAction, debounce)

    // Create throttled action if applicable
    } else if (throttle > 0) {
      emitOnAction.current = throttled(onAction, throttle)

    // No throttle or debounce
    } else {
      emitOnAction.current = onAction
    }
  }, [onAction])

  useEffect(() => {
    _timeout.current = timeout
    if (idle.current && !firstLoad.current) _toggleIdleState()
    if (tId.current !== null) reset()
    firstLoad.current = false
  }, [timeout])

  return {
    isIdle,
    isLeader,
    start: reset,
    pause,
    reset,
    resume,
    getLastIdleTime,
    getTotalIdleTime,
    getLastActiveTime,
    getTotalActiveTime,
    getElapsedTime,
    getRemainingTime
  }
}

/**
 * Type checks for every property
 * @type {Object}
 * @private
 */
useIdleTimer.propTypes = {
  /**
   * Activity Timeout in milliseconds
   * default: 1200000
   * @type {number}
   */
  timeout: PropTypes.number,
  /**
   * DOM events to listen to
   * default: see [default events](https://github.com/SupremeTechnopriest/react-idle-timer#default-events)
   * @type {Array}
   */
  events: PropTypes.arrayOf(PropTypes.string),
  /**
   * Function to call when user is idle.
   * default: () => {}
   * @type {Function}
   */
  onIdle: PropTypes.func,
  /**
   * Function to call when user becomes active.
   * default: () => {}
   * @type {Function}
   */
  onActive: PropTypes.func,
  /**
   * Function to call on user actions.
   * default: () => {}
   * @type {Function}
   */
  onAction: PropTypes.func,
  /**
   * Debounce the onAction function by setting delay in milliseconds.
   * default: 0
   * @type {number}
   */
  debounce: PropTypes.number,
  /**
   * Throttle the onAction function by setting delay in milliseconds.
   * default: 0
   * @type {number}
   */
  throttle: PropTypes.number,
  /**
   * Throttle the event handler function by setting delay in milliseconds.
   * default: 200
   * @type {number}
   */
  eventsThrottle: PropTypes.number,
  /**
   * Element reference to bind activity listeners to.
   * default: document
   * @type {Object}
   */
  element: PropTypes.oneOfType([PropTypes.object, PropTypes.element]),
  /**
   * Start the timer on mount.
   * default: true
   * @type {Boolean}
   */
  startOnMount: PropTypes.bool,
  /**
   * Require the timer to be started manually.
   * default: false
   * @type {Boolean}
   */
  startManually: PropTypes.bool,
  /**
   * Once the user goes idle the IdleTimer will not
   * reset on user input instead, start() or reset() must be
   * called manually to restart the timer.
   * default: false
   * @type {Boolean}
   */
  stopOnIdle: PropTypes.bool,
  /**
   * Bind events passively.
   * default: true
   * @type {Boolean}
   */
  passive: PropTypes.bool,
  /**
   * Capture events.
   * default: true
   * @type {Boolean}
   */
  capture: PropTypes.bool,
  /**
   * Cross Tab functionality.
   * default: true
   * @type {Boolean|Object}
   */
  crossTab: PropTypes.oneOfType([
    PropTypes.bool,
    PropTypes.shape({
      type: PropTypes.oneOf(['native', 'localStorage', 'simulate']),
      channelName: PropTypes.string,
      fallbackInterval: PropTypes.number,
      responseTime: PropTypes.number,
      removeTimeout: PropTypes.number
    })
  ])
}

/**
 * Sets default property values
 * @type {Object}
 * @private
 */
useIdleTimer.defaultProps = {
  timeout: 1000 * 60 * 20,
  element: DEFAULT_ELEMENT,
  events: DEFAULT_EVENTS,
  onIdle: () => { },
  onActive: () => { },
  onAction: () => { },
  debounce: 0,
  throttle: 0,
  eventsThrottle: 200,
  startOnMount: true,
  startManually: false,
  stopOnIdle: false,
  capture: true,
  passive: true,
  crossTab: false
}

export default useIdleTimer
