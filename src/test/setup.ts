// React 18 requires this global flag for `act()` to work correctly in tests;
// without it every state update inside act() prints a console warning.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
