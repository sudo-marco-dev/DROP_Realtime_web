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
  | { type: 'FIRE_MANUAL_TEST' };

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

export function dropReducer(state: DropState, action: DropAction): DropState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.state };

    case 'KEY_DIGIT': {
      // Do not allow typing if tampering alarm is active or in Open/Ready to Arm states where keypad digits aren't expected
      if (state.isTampering) return state;
      
      const newBuffer = state.inputBuffer + action.digit;
      return {
        ...state,
        inputBuffer: newBuffer,
        lcdLine2: pad16(`PIN: ${newBuffer}`),
      };
    }

    case 'KEY_HASH': {
      if (state.isTampering) return state;
      
      let nextState = state.currentState;
      let nextIsLocked = state.isLocked;
      let nextPrimedAmount = state.primedAmount;
      let nextParcelCost = state.parcelCost;
      let lcd1 = state.lcdLine1;
      let lcd2 = state.lcdLine2;
      let face = state.oledFace;
      let triggerEvent: DropState['lastTriggerEvent'] = null;

      switch (state.currentState) {
        case 'STATE_IDLE':
          if (state.inputBuffer === state.ownerPin) {
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
            lcd1 = 'SYSTEM LOCKED';
            lcd2 = 'Wrong PIN';
            face = '(X_X)';
            triggerEvent = {
              type: 'WRONG_PIN',
              timestamp: Date.now(),
              notes: `Failed Owner authentication. Entered PIN: "${state.inputBuffer}"`,
            };
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
            nextState = 'STATE_RIDER_DROP';
            lcd1 = 'RIDER OK';
            lcd2 = 'Enter Cost';
            face = '($~$)';
          } else {
            lcd1 = 'READY FOR DROP';
            lcd2 = 'Wrong PIN';
            face = '(X_X)';
            triggerEvent = {
              type: 'WRONG_PIN',
              timestamp: Date.now(),
              notes: `Failed Rider authentication. Entered PIN: "${state.inputBuffer}"`,
            };
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
            // Beep error would play in side effect
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
      };
    }

    case 'KEY_STAR': {
      if (state.isTampering) return state;

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

    case 'TRIGGER_TAMPER':
      if (state.isTampering) return state;
      return {
        ...state,
        isTampering: true,
        lcdLine1: pad16('TAMPER DETECTED'),
        lcdLine2: pad16('ALARM ACTIVE'),
        oledFace: '(>_<)',
        lastTriggerEvent: {
          type: 'TAMPER_DETECTED',
          timestamp: Date.now(),
          notes: 'Tamper sensor triggered. Siren active!',
        },
      };

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

    default:
      return state;
  }
}
