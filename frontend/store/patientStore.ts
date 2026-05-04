import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Patient } from "@/types";

const MAX_RECENT = 12;

type PatientStoreState = {
  recentPatients: Pick<Patient, "id" | "full_name" | "mrn">[];
  rememberPatient: (p: Pick<Patient, "id" | "full_name" | "mrn">) => void;
  clearRecent: () => void;
};

export const usePatientStore = create<PatientStoreState>()(
  persist(
    (set, get) => ({
      recentPatients: [],
      rememberPatient: (p) => {
        const cur = get().recentPatients.filter((x) => x.id !== p.id);
        set({ recentPatients: [p, ...cur].slice(0, MAX_RECENT) });
      },
      clearRecent: () => set({ recentPatients: [] }),
    }),
    { name: "hms-patient-recent" },
  ),
);
