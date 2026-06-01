export type SystemState =
  | 'STATE_IDLE'
  | 'STATE_PRIMING'
  | 'STATE_READY_TO_ARM'
  | 'STATE_READY'
  | 'STATE_RIDER_DROP'
  | 'STATE_OPEN';

export interface DropState {
  currentState: SystemState;
  inputBuffer: string;
  primedAmount: number;
  parcelCost: number;
  ownerPin: string;
  riderPin: string;
  isLocked: boolean; // true = closed (servo LOCKED), false = open (servo OPEN)

  // LCD Lines (16 chars padded)
  lcdLine1: string;
  lcdLine2: string;
  oledFace: string;

  // Sensors
  lidClosed: boolean;      // limit switch
  parcelPresent: boolean;  // weight sensor
  tiltDetected: boolean;   // tilt sensor switch state
  isTampering: boolean;    // active tamper alarm

  // Trigger audit log for side-effects (e.g. notifications & photos)
  lastTriggerEvent: {
    type: 'OWNER_LOGIN' | 'WRONG_PIN' | 'TAMPER_DETECTED' | 'DELIVERY_SUCCESS' | 'ARMED' | 'REMOTE_UNLOCK' | 'MANUAL_TEST' | null;
    timestamp: number;
    notes?: string;
  } | null;

  // Cooldown / Security
  failedAttempts: number;
  inCooldown: boolean;
  lockoutTimer: number | null;  // timestamp when cooldown ends
  remainingCountdown: number;   // seconds remaining for live LCD display

  // Anti-spam timestamps
  lastTamperAlert: number | null;    // timestamp of last TAMPER_DETECTED Discord alert
  lastWrongPinAlert: number | null;  // timestamp of last WRONG_PIN Discord alert
}

export const INITIAL_STATE: DropState = {
  currentState: 'STATE_IDLE',
  inputBuffer: '',
  primedAmount: 0,
  parcelCost: 0,
  ownerPin: '1234',
  riderPin: '5678',
  isLocked: true,
  lcdLine1: 'SYSTEM LOCKED',
  lcdLine2: 'PIN: ',
  oledFace: '(-_-)',
  lidClosed: true,
  parcelPresent: false,
  tiltDetected: false,
  isTampering: false,
  lastTriggerEvent: null,
  failedAttempts: 0,
  inCooldown: false,
  lockoutTimer: null,
  remainingCountdown: 0,
  lastTamperAlert: null,
  lastWrongPinAlert: null,
};

export type DropAction =
  | { type: 'KEY_DIGIT'; digit: string }
  | { type: 'KEY_HASH' }
  | { type: 'KEY_STAR' }
  | { type: 'SET_LID'; closed: boolean }
  | { type: 'SET_WEIGHT'; present: boolean }
  | { type: 'SET_TILT'; detected: boolean }
  | { type: 'TRIGGER_TAMPER' }
  | { type: 'CLEAR_TAMPER' }
  | { type: 'REMOTE_UNLOCK' }
  | { type: 'REMOTE_LOCK' }
  | { type: 'SET_PINS'; ownerPin?: string; riderPin?: string }
  | { type: 'RESET_TRIGGER_EVENT' }
  | { type: 'SET_STATE'; state: Partial<DropState> }
  | { type: 'FIRE_MANUAL_TEST' }
  | { type: 'TICK_COOLDOWN' };

// Utility to pad strings to 16 chars for LCD emulation
export function pad16(str: string): string {
  if (str.length >= 16) return str.substring(0, 16);
  return str + ' '.repeat(16 - str.length);
}

// Map system states to their display strings
export function getOledTitle(state: SystemState): string {
  switch (state) {
    case 'STATE_IDLE': return 'LOCKED';
    case 'STATE_READY': return 'READY';
    case 'STATE_OPEN': return 'OPEN';
    case 'STATE_PRIMING': return 'PRIMING';
    case 'STATE_READY_TO_ARM': return 'ARMING';
    case 'STATE_RIDER_DROP': return 'DROP';
    default: return 'SYSTEM';
  }
}

// 30-second cooldown like the ESP32 firmware
const COOLDOWN_DURATION_MS = 30000;

// Anti-spam intervals
const TAMPER_ALERT_COOLDOWN_MS = 10000;  // 10s between tamper Discord alerts
const WRONG_PIN_ALERT_COOLDOWN_MS = 30000; // 30s between wrong-pin Discord alerts

const COOLDOWN_STATE_THRESHOLD = 3; // 3 failed attempts triggers cooldown

// Helper to build cooldown LCD lines
function buildCooldownDisplay(remainingSeconds: number) {
  const remainStr = Math.max(0, remainingSeconds).toString();
  const line1 = 'COOLDOWN ' + remainStr + 's';
  return {
    lcdLine1: pad16(line1),
    lcdLine2: pad16('WAIT'),
    oledFace: '(>_<)',
  };
}

export function dropReducer(state: DropState, action: DropAction): DropState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.state };

    case 'KEY_DIGIT': {
      // Block keypad during tamper OR cooldown
      if (state.isTampering || state.inCooldown) return state;

      const newBuffer = state.inputBuffer + action.digit;
      return {
        ...state,
        inputBuffer: newBuffer,
        lcdLine2: pad16(`PIN: ${newBuffer}`),
      };
    }

    case 'KEY_HASH': {
      // Block keypad during tamper OR cooldown
      if (state.isTampering || state.inCooldown) return state;

      let nextState: SystemState = state.currentState;
      let nextIsLocked: boolean = state.isLocked;
      let nextPrimedAmount: number = state.primedAmount;
      let nextParcelCost: number = state.parcelCost;
      let lcd1: string = state.lcdLine1;
      let lcd2: string = state.lcdLine2;
      let face: string = state.oledFace;
      let triggerEvent: DropState['lastTriggerEvent'] = null;
      let nextFailedAttempts: number = state.failedAttempts;
      let nextInCooldown: boolean = state.inCooldown;
      let nextLockoutTimer: number | null = state.lockoutTimer;
      let nextRemainingCountdown: number = state.remainingCountdown;
      let nextLastWrongPinAlert: number | null = state.lastWrongPinAlert;

      const handleWrongPin = (context: string) => {
        nextFailedAttempts += 1;

        if (nextFailedAttempts >= COOLDOWN_STATE_THRESHOLD) {
          // Trigger cooldown
          const lockoutEnd = Date.now() + COOLDOWN_DURATION_MS;
          nextInCooldown = true;
          nextLockoutTimer = lockoutEnd;
          nextRemainingCountdown = Math.ceil(COOLDOWN_DURATION_MS / 1000);

          // Override display with cooldown
          const cooldownDisp = buildCooldownDisplay(nextRemainingCountdown);
          lcd1 = cooldownDisp.lcdLine1;
          lcd2 = cooldownDisp.lcdLine2;
          face = cooldownDisp.oledFace;

          // Fire WRONG_PIN trigger ONLY on 3rd attempt AND
          // only if enough time has passed since last alert (anti-spam)
          const now = Date.now();
          if (
            nextLastWrongPinAlert === null ||
            (now - nextLastWrongPinAlert) >= WRONG_PIN_ALERT_COOLDOWN_MS
          ) {
            triggerEvent = {
              type: 'WRONG_PIN',
              timestamp: now,
              notes: `Failed ${context} authentication. Cooldown triggered after ${COOLDOWN_STATE_THRESHOLD} failed attempts. Last entered PIN: "${state.inputBuffer}"`,
            };
            nextLastWrongPinAlert = now;
          }

          // Reset failed attempts after cooldown is triggered
          nextFailedAttempts = 0;
        } else {
          // 1st or 2nd wrong PIN: show error feedback, NO trigger event (no Discord)
          if (state.currentState === 'STATE_IDLE') {
            lcd1 = 'SYSTEM LOCKED';
          } else {
            lcd1 = 'READY FOR DROP';
          }
          lcd2 = 'Wrong PIN';
          face = '(X_X)';
          // triggerEvent stays null intentionally
        }
      };

      switch (state.currentState) {
        case 'STATE_IDLE':
          if (state.inputBuffer === state.ownerPin) {
            // Correct owner PIN → reset failed attempts
            nextFailedAttempts = 0;
            nextIsLocked = false; // Servo Open
            nextState = 'STATE_PRIMING';
            lcd1 = 'OWNER OK';
            lcd2 = 'Enter Amount';
            face = '(o_o)';
            triggerEvent = {
              type: 'OWNER_LOGIN',
              timestamp: Date.now(),
              notes: 'Owner authenticated successfully. Lock servo opened.',
            };
          } else {
            handleWrongPin('Owner');
          }
          break;

        case 'STATE_PRIMING':
          nextPrimedAmount = parseInt(state.inputBuffer) || 0;
          nextState = 'STATE_READY_TO_ARM';
          lcd1 = 'Saved';
          lcd2 = 'Press * to ARM';
          face = '[-_-]';
          break;

        case 'STATE_READY':
          if (state.inputBuffer === state.riderPin) {
            // Correct rider PIN → reset failed attempts
            nextFailedAttempts = 0;
            nextState = 'STATE_RIDER_DROP';
            lcd1 = 'RIDER OK';
            lcd2 = 'Enter Cost';
            face = '($~$)';
          } else {
            handleWrongPin('Rider');
          }
          break;

        case 'STATE_RIDER_DROP':
          nextParcelCost = parseInt(state.inputBuffer) || 0;
          if (nextParcelCost <= state.primedAmount) {
            nextIsLocked = false; // Servo Open
            nextState = 'STATE_OPEN';
            lcd1 = 'OPEN';
            lcd2 = 'Close + *';
            face = '(^O^)';
          } else {
            lcd1 = 'ERROR';
            lcd2 = 'Insufficient';
            face = '(X_X)';
          }
          break;

        default:
          break;
      }

      return {
        ...state,
        currentState: nextState,
        isLocked: nextIsLocked,
        primedAmount: nextPrimedAmount,
        parcelCost: nextParcelCost,
        inputBuffer: '',
        lcdLine1: pad16(lcd1),
        lcdLine2: pad16(lcd2),
        oledFace: face,
        lastTriggerEvent: triggerEvent,
        failedAttempts: nextFailedAttempts,
        inCooldown: nextInCooldown,
        lockoutTimer: nextLockoutTimer,
        remainingCountdown: nextRemainingCountdown,
        lastWrongPinAlert: nextLastWrongPinAlert,
      };
    }

    case 'KEY_STAR': {
      // Block keypad during tamper OR cooldown
      if (state.isTampering || state.inCooldown) return state;

      let nextState = state.currentState;
      let nextIsLocked = state.isLocked;
      let nextPrimedAmount = state.primedAmount;
      let lcd1 = state.lcdLine1;
      let lcd2 = state.lcdLine2;
      let face = state.oledFace;
      let triggerEvent: DropState['lastTriggerEvent'] = null;

      if (state.currentState === 'STATE_READY_TO_ARM') {
        nextIsLocked = true; // Servo Closed
        nextState = 'STATE_READY';
        lcd1 = 'READY FOR DROP';
        lcd2 = 'Rider PIN:';
        face = '[O_O]';
        triggerEvent = {
          type: 'ARMED',
          timestamp: Date.now(),
          notes: `System armed. Primed amount: $${state.primedAmount}. Lock servo closed.`,
        };
      }
      else if (state.currentState === 'STATE_OPEN') {
        // Safe arming: Lid closed and parcel present
        if (state.lidClosed && state.parcelPresent) {
          nextIsLocked = true; // Servo Closed
          nextState = 'STATE_IDLE';
          nextPrimedAmount = 0;
          lcd1 = 'LOCKED';
          lcd2 = 'Thank You';
          face = '(-_-)';
          triggerEvent = {
            type: 'DELIVERY_SUCCESS',
            timestamp: Date.now(),
            notes: `Parcel delivered successfully. Lock servo closed. Cost: $${state.parcelCost}, Primed balance reset.`,
          };
        } else {
          lcd1 = 'ERROR';
          lcd2 = 'Close + Load';
          face = '(X_X)';
        }
      }

      return {
        ...state,
        currentState: nextState,
        isLocked: nextIsLocked,
        primedAmount: nextPrimedAmount,
        inputBuffer: '',
        lcdLine1: pad16(lcd1),
        lcdLine2: pad16(lcd2),
        oledFace: face,
        lastTriggerEvent: triggerEvent,
      };
    }

    case 'SET_LID':
      return {
        ...state,
        lidClosed: action.closed,
      };

    case 'SET_WEIGHT':
      return {
        ...state,
        parcelPresent: action.present,
      };

    case 'SET_TILT':
      return {
        ...state,
        tiltDetected: action.detected,
      };

    case 'TRIGGER_TAMPER': {
      if (state.isTampering) return state;

      // Anti-spam: suppress if last tamper alert was < 10 seconds ago
      const now = Date.now();
      let shouldFireTrigger = true;
      if (state.lastTamperAlert !== null && (now - state.lastTamperAlert) < TAMPER_ALERT_COOLDOWN_MS) {
        shouldFireTrigger = false;
      }

      return {
        ...state,
        isTampering: true,
        lcdLine1: pad16('TAMPER DETECTED'),
        lcdLine2: pad16('ALARM ACTIVE'),
        oledFace: '(>_<)',
        lastTriggerEvent: shouldFireTrigger ? {
          type: 'TAMPER_DETECTED',
          timestamp: now,
          notes: 'Tamper sensor triggered. Siren active!',
        } : null,
        lastTamperAlert: shouldFireTrigger ? now : state.lastTamperAlert,
      };
    }

    case 'CLEAR_TAMPER':
      if (!state.isTampering) return state;
      // Restore UI back to what it should be depending on currentState
      let restoredLcd1 = 'SYSTEM';
      let restoredLcd2 = 'Resume';
      let restoredFace = '(o_o)';
      if (state.currentState === 'STATE_IDLE') {
        restoredLcd1 = 'SYSTEM LOCKED';
        restoredLcd2 = 'PIN: ';
        restoredFace = '(-_-)';
      } else if (state.currentState === 'STATE_READY') {
        restoredLcd1 = 'READY FOR DROP';
        restoredLcd2 = 'Rider PIN:';
        restoredFace = '[O_O]';
      } else if (state.currentState === 'STATE_OPEN') {
        restoredLcd1 = 'SYSTEM OPEN';
        restoredLcd2 = 'Close + *';
        restoredFace = '(^O^)';
      }
      return {
        ...state,
        isTampering: false,
        lcdLine1: pad16(restoredLcd1),
        lcdLine2: pad16(restoredLcd2),
        oledFace: restoredFace,
      };

    case 'REMOTE_UNLOCK':
      return {
        ...state,
        currentState: 'STATE_OPEN',
        isLocked: false,
        inputBuffer: '',
        lcdLine1: pad16('SYSTEM OPEN'),
        lcdLine2: pad16('Close + *'),
        oledFace: '(^O^)',
        lastTriggerEvent: {
          type: 'REMOTE_UNLOCK',
          timestamp: Date.now(),
          notes: 'Remote unlock command received via Dashboard. Lock servo opened.',
        },
      };

    case 'REMOTE_LOCK':
      return {
        ...state,
        currentState: 'STATE_IDLE',
        isLocked: true,
        primedAmount: 0,
        inputBuffer: '',
        lcdLine1: pad16('SYSTEM LOCKED'),
        lcdLine2: pad16('PIN: '),
        oledFace: '(-_-)',
      };

    case 'SET_PINS':
      return {
        ...state,
        ownerPin: action.ownerPin ?? state.ownerPin,
        riderPin: action.riderPin ?? state.riderPin,
      };

    case 'RESET_TRIGGER_EVENT':
      return {
        ...state,
        lastTriggerEvent: null,
      };

    case 'FIRE_MANUAL_TEST':
      return {
        ...state,
        lastTriggerEvent: {
          type: 'MANUAL_TEST',
          timestamp: Date.now(),
          notes: 'Manual CCTV capture and Discord notification test fired.',
        }
      };

    case 'TICK_COOLDOWN': {
      if (!state.inCooldown) return state;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil(((state.lockoutTimer ?? now) - now) / 1000));

      if (remaining <= 0) {
        // Cooldown expired — restore UI based on what state we were in
        // We detect the original state by checking currentState.lcdLine1 patterns
        // OR we just restore to IDLE since cooldown only triggers from IDLE or READY
        let restoredLcd1 = 'SYSTEM LOCKED';
        let restoredLcd2 = 'PIN: ';
        let restoredFace = '(-_-)';

        // If we were in READY state (rider PIN cooldown), restore to READY
        // We infer this: if cooldown fired from STATE_READY, the currentState is still 
        // the same (we never changed it during cooldown). Check currentState.
        if (state.currentState === 'STATE_READY') {
          restoredLcd1 = 'READY FOR DROP';
          restoredLcd2 = 'Rider PIN:';
          restoredFace = '[O_O]';
        } else {
          // Assume STATE_IDLE
          restoredLcd1 = 'SYSTEM LOCKED';
          restoredLcd2 = 'PIN: ';
          restoredFace = '(-_-)';
        }

        return {
          ...state,
          inCooldown: false,
          lockoutTimer: null,
          remainingCountdown: 0,
          lcdLine1: pad16(restoredLcd1),
          lcdLine2: pad16(restoredLcd2),
          oledFace: restoredFace,
          inputBuffer: '',
        };
      }

      // Update countdown display
      const cooldownDisp = buildCooldownDisplay(remaining);
      return {
        ...state,
        remainingCountdown: remaining,
        lcdLine1: cooldownDisp.lcdLine1,
        lcdLine2: cooldownDisp.lcdLine2,
        oledFace: cooldownDisp.oledFace,
      };
    }

    default:
      return state;
  }
}