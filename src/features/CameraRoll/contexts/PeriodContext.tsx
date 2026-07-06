import React, { createContext, ReactNode, useContext } from "react";
import { Period, usePeriod } from "../hooks/usePeriod";

type PeriodContextValue = ReturnType<typeof usePeriod>;

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

// Provides the selected period (plus the period list and setter) to the whole camera-roll screen, so
// descendants read it directly instead of having it drilled through props — the same way dayShift is
// read ambiently from preferences.
export function PeriodProvider({ children }: { children: ReactNode }) {
  const value = usePeriod();
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriodContext(): PeriodContextValue {
  const context = useContext(PeriodContext);
  if (context === undefined) {
    throw new Error("usePeriodContext must be used within a PeriodProvider");
  }
  return context;
}

// Convenience for components mounted only once a period is selected (CameraRoll and its subtree): the
// selected period is guaranteed defined there, so callers get a non-nullable Period.
export function useSelectedPeriod(): Period {
  const { selectedPeriod } = usePeriodContext();
  if (!selectedPeriod) {
    throw new Error("useSelectedPeriod used without a selected period");
  }
  return selectedPeriod;
}
