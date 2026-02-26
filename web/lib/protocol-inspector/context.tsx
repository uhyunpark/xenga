"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";

export type InspectorEventType =
  | "http_request"
  | "http_response"
  | "eip712_sign"
  | "signature_result"
  | "tx_submitted"
  | "tx_confirmed"
  | "state_change"
  | "reputation_check";

export interface InspectorEvent {
  id: string;
  type: InspectorEventType;
  timestamp: number;
  data: Record<string, any>;
  label?: string;
}

interface InspectorState {
  events: InspectorEvent[];
  activeTab: "http" | "onchain" | "reputation";
  isOpen: boolean;
  currentState?: string;
}

type InspectorAction =
  | { type: "ADD_EVENT"; event: InspectorEvent }
  | { type: "SET_TAB"; tab: InspectorState["activeTab"] }
  | { type: "TOGGLE_OPEN" }
  | { type: "SET_OPEN"; isOpen: boolean }
  | { type: "CLEAR" }
  | { type: "SET_STATE"; state: string };

function reducer(state: InspectorState, action: InspectorAction): InspectorState {
  switch (action.type) {
    case "ADD_EVENT":
      return {
        ...state,
        events: [...state.events, action.event],
        ...(state.events.length === 0 ? { isOpen: true } : {}),
      };
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "TOGGLE_OPEN":
      return { ...state, isOpen: !state.isOpen };
    case "SET_OPEN":
      return { ...state, isOpen: action.isOpen };
    case "CLEAR":
      return { ...state, events: [], currentState: undefined };
    case "SET_STATE":
      return { ...state, currentState: action.state };
    default:
      return state;
  }
}

interface InspectorContextValue extends InspectorState {
  addEvent: (event: Omit<InspectorEvent, "id" | "timestamp">) => void;
  setTab: (tab: InspectorState["activeTab"]) => void;
  toggle: () => void;
  setOpen: (isOpen: boolean) => void;
  clear: () => void;
  setCurrentState: (state: string) => void;
}

const InspectorContext = createContext<InspectorContextValue | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    events: [],
    activeTab: "http",
    isOpen: false,
    currentState: undefined,
  });

  const addEvent = useCallback(
    (event: Omit<InspectorEvent, "id" | "timestamp">) => {
      const fullEvent: InspectorEvent = {
        ...event,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_EVENT", event: fullEvent });

      // Auto-switch tab based on event type
      if (event.type === "http_request" || event.type === "http_response") {
        dispatch({ type: "SET_TAB", tab: "http" });
      } else if (
        event.type === "tx_submitted" ||
        event.type === "tx_confirmed"
      ) {
        dispatch({ type: "SET_TAB", tab: "onchain" });
      } else if (event.type === "state_change") {
        dispatch({ type: "SET_TAB", tab: "onchain" });
        dispatch({ type: "SET_STATE", state: event.data.newState });
      } else if (event.type === "reputation_check") {
        dispatch({ type: "SET_TAB", tab: "reputation" });
      }
    },
    []
  );

  const setTab = useCallback(
    (tab: InspectorState["activeTab"]) => dispatch({ type: "SET_TAB", tab }),
    []
  );

  const toggle = useCallback(() => dispatch({ type: "TOGGLE_OPEN" }), []);

  const setOpen = useCallback(
    (isOpen: boolean) => dispatch({ type: "SET_OPEN", isOpen }),
    []
  );

  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const setCurrentState = useCallback(
    (s: string) => dispatch({ type: "SET_STATE", state: s }),
    []
  );

  return (
    <InspectorContext.Provider
      value={{
        ...state,
        addEvent,
        setTab,
        toggle,
        setOpen,
        clear,
        setCurrentState,
      }}
    >
      {children}
    </InspectorContext.Provider>
  );
}

export function useInspector() {
  const ctx = useContext(InspectorContext);
  if (!ctx)
    throw new Error("useInspector must be used within InspectorProvider");
  return ctx;
}
