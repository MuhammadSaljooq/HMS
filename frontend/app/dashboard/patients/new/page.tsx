"use client";

import Link from "next/link";

import { PatientForm } from "@/components/patients/PatientForm";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { NEW_PATIENT_ROLES } from "@/lib/rbac";
import { usePatients } from "@/hooks/usePatients";
import styles from "../theme-patients.module.css";

export default function NewPatientPage() {
  const { create } = usePatients();

  return (
    <RoleGuard roles={NEW_PATIENT_ROLES}>
      <>
        <main className={styles.main}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>Register New Patient</h1>
              <p className={styles.heroSubtitle}>
                Capture the patient profile once, validate demographics before save, and continue into appointments or records.
              </p>
            </div>
            <Link href="/dashboard/patients" className={styles.makeConfBtn}>
              Back to Patients
            </Link>
          </div>

          <div className={styles.statRow}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Registration mode</p>
              <p className={styles.summaryValue}>Manual</p>
              <p className={styles.summarySub}>Front-desk staff can create a new chart and receive the MRN instantly after save.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Form sections</p>
              <p className={styles.summaryValue}>3</p>
              <p className={styles.summarySub}>Identity, contact details, and emergency contact are grouped for faster intake.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Next workflow</p>
              <p className={styles.summaryValue}>Chart</p>
              <p className={styles.summarySub}>After registration, move directly to appointments or the medical records workflow.</p>
            </div>
          </div>

          <div className={styles.contentColumn}>
            <div className={styles.dataCard}>
              <header className={styles.dataHeader}>
                <div>
                  <h3 className={styles.dataTitle}>Patient intake form</h3>
                  <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                    Use complete legal names, verified contact details, and an available emergency contact whenever possible.
                  </p>
                </div>
                <span className={styles.dropdown}>Live validation</span>
              </header>
              <PatientForm onSubmit={create} />
            </div>
          </div>
        </main>

        <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Registration Help</h3>
            <span className={styles.smallBtn}>ℹ</span>
          </header>
          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>📋</span>
            <p className={styles.reminderText}>
              Ask for the patient&apos;s correct date of birth and active phone number first. These two details reduce duplicate charts.
            </p>
            <span className={styles.remindBtn}>Tip</span>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Required fields</p>
            <p className={styles.summaryValue}>2</p>
            <p className={styles.summarySub}>Full name and date of birth are mandatory before a new patient chart can be created.</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Recommended</p>
            <p className={styles.summarySub}>
              Add a reachable phone number, full address, and emergency contact to support later scheduling and follow-up calls.
            </p>
          </div>
          <div className={styles.conferenceList}>
            <Link href="/dashboard/patients" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Directory</span>
                <span className={styles.confHour}>PAT</span>
              </div>
              <div>
                <p className={styles.confName}>Open patient registry</p>
                <p className={styles.confDoctor}>Return to the live patient list after finishing intake.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
            <Link href="/dashboard/appointments" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Next</span>
                <span className={styles.confHour}>APT</span>
              </div>
              <div>
                <p className={styles.confName}>Schedule appointment</p>
                <p className={styles.confDoctor}>Continue directly into visit booking once the chart exists.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
          </div>
        </aside>
      </>
    </RoleGuard>
  );
}
