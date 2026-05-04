# 🏥 Hospital Management System — Complete Plan & Cursor Prompts

---

## PART 1: SYSTEM OVERVIEW

A full-stack Hospital Management System (HMS) with:
- Patient data management (registration, records, history)
- AI-powered transcriber (Urdu + English → English output)
- Role-based access (Admin, Doctor, Receptionist, Nurse)
- Real-time dashboard and analytics
- Appointment scheduling
- Prescription management

---

## PART 2: TECH STACK (Reliable + Cheap for Live Deployment)

### Frontend
| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | **Next.js 14 (App Router)** | SSR + SSG, great for dashboards |
| UI Library | **shadcn/ui + Tailwind CSS** | Free, accessible, production-ready |
| State Management | **Zustand** | Lightweight, no boilerplate |
| Forms | **React Hook Form + Zod** | Fast validation |
| Charts | **Recharts** | Free, React-native |
| Audio/Transcription UI | **MediaRecorder API** | Built-in browser API |

### Backend
| Layer | Technology | Why |
|-------|-----------|-----|
| API Framework | **FastAPI (Python)** | Fast, async, auto-docs |
| Database ORM | **SQLAlchemy + Alembic** | Migrations + type safety |
| Auth | **JWT + bcrypt** | Stateless, secure |
| File Storage | **Cloudflare R2** | S3-compatible, FREE 10GB/month |
| Task Queue | **Celery + Redis** | Async transcription jobs |

### Database
| Use | Database | Why |
|-----|---------|-----|
| Primary (patients, users, records) | **PostgreSQL** | ACID, relational, robust |
| Cache + Queue | **Redis** | Fast, used by Celery |

### AI Transcription
| Component | Technology | Why |
|-----------|-----------|-----|
| Speech-to-Text | **OpenAI Whisper (large-v3)** | Best Urdu+English support |
| Hosting | **Replicate.com OR self-hosted on Render** | Pay-per-use |
| Translation/Cleanup | **Claude API (claude-sonnet-4)** | Clean, structure output |

### Deployment (Cheap + Reliable)
| Service | Platform | Monthly Cost |
|---------|---------|-------------|
| Frontend | **Vercel** (free tier) | $0 |
| Backend API | **Render.com** | $7/month |
| PostgreSQL | **Supabase** (free tier) | $0 (500MB free) |
| Redis | **Upstash** | $0 (free tier) |
| File Storage | **Cloudflare R2** | ~$0 (10GB free) |
| Whisper API | **Replicate** | Pay per call (~$0.0038/min) |
| **Total** | | **~$7-15/month** |

---

## PART 3: SYSTEM ARCHITECTURE & CODE FLOW

```
Browser (Next.js)
    │
    ├── Auth Layer (JWT tokens)
    │
    ├── REST API calls → FastAPI Backend
    │       │
    │       ├── PostgreSQL (patients, appointments, prescriptions)
    │       ├── Redis (sessions, task queue)
    │       └── Cloudflare R2 (audio files, documents)
    │
    └── AI Transcription Flow:
            1. User clicks "Record" → MediaRecorder captures audio
            2. Audio blob → POST /api/transcribe (multipart)
            3. FastAPI saves audio to R2, sends job to Celery
            4. Celery worker → Whisper API (Urdu/English)
            5. Raw transcript → Claude API (clean + structure)
            6. Result saved to DB, returned to frontend via WebSocket/polling
```

### Database Schema (Core Tables)

```sql
-- Users (staff)
users: id, email, password_hash, role (admin|doctor|nurse|receptionist), name, created_at

-- Patients
patients: id, mrn (medical record number), name, dob, gender, phone, 
          address, blood_group, emergency_contact, created_at, updated_at

-- Appointments  
appointments: id, patient_id, doctor_id, scheduled_at, status, notes, created_at

-- Medical Records
medical_records: id, patient_id, doctor_id, appointment_id, 
                 chief_complaint, diagnosis, created_at

-- Prescriptions
prescriptions: id, medical_record_id, medication, dosage, frequency, duration

-- Transcriptions
transcriptions: id, medical_record_id, audio_file_url, raw_transcript, 
                cleaned_transcript, language_detected, status, created_at

-- Vitals
vitals: id, patient_id, recorded_by, blood_pressure, heart_rate, 
        temperature, weight, height, recorded_at
```

---

## PART 4: DIRECTORY STRUCTURE

```
hms/
├── frontend/                          # Next.js 14 App
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # Sidebar + header shell
│   │   │   ├── page.tsx               # Dashboard home
│   │   │   ├── patients/
│   │   │   │   ├── page.tsx           # Patient list
│   │   │   │   ├── [id]/page.tsx      # Patient detail
│   │   │   │   └── new/page.tsx       # Register new patient
│   │   │   ├── appointments/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── transcriber/
│   │   │   │   └── page.tsx           # AI Transcription tool
│   │   │   ├── records/
│   │   │   │   └── [patientId]/page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   └── auth/[...nextauth]/route.ts
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                        # shadcn components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── patients/
│   │   │   ├── PatientCard.tsx
│   │   │   ├── PatientForm.tsx
│   │   │   ├── PatientTable.tsx
│   │   │   └── VitalsForm.tsx
│   │   ├── transcriber/
│   │   │   ├── AudioRecorder.tsx      # MediaRecorder component
│   │   │   ├── TranscriptDisplay.tsx
│   │   │   └── TranscriptionHistory.tsx
│   │   ├── appointments/
│   │   │   ├── AppointmentCalendar.tsx
│   │   │   └── AppointmentForm.tsx
│   │   └── dashboard/
│   │       ├── StatsCards.tsx
│   │       └── RecentActivity.tsx
│   ├── lib/
│   │   ├── api.ts                     # Axios/fetch wrapper
│   │   ├── auth.ts                    # Auth helpers
│   │   └── utils.ts
│   ├── store/
│   │   ├── authStore.ts               # Zustand auth store
│   │   └── patientStore.ts
│   ├── types/
│   │   └── index.ts                   # TypeScript interfaces
│   ├── hooks/
│   │   ├── usePatients.ts
│   │   ├── useTranscription.ts
│   │   └── useAudioRecorder.ts
│   ├── .env.local
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/                           # FastAPI Python
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app entry
│   │   ├── config.py                  # Settings (pydantic-settings)
│   │   ├── database.py                # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── patient.py
│   │   │   ├── appointment.py
│   │   │   ├── medical_record.py
│   │   │   ├── prescription.py
│   │   │   ├── transcription.py
│   │   │   └── vitals.py
│   │   ├── schemas/                   # Pydantic schemas
│   │   │   ├── user.py
│   │   │   ├── patient.py
│   │   │   ├── appointment.py
│   │   │   └── transcription.py
│   │   ├── routers/
│   │   │   ├── auth.py                # /api/auth/*
│   │   │   ├── patients.py            # /api/patients/*
│   │   │   ├── appointments.py        # /api/appointments/*
│   │   │   ├── records.py             # /api/records/*
│   │   │   ├── transcriptions.py      # /api/transcribe/*
│   │   │   └── dashboard.py           # /api/dashboard/*
│   │   ├── services/
│   │   │   ├── auth_service.py        # JWT logic
│   │   │   ├── patient_service.py
│   │   │   ├── transcription_service.py  # Whisper + Claude
│   │   │   └── storage_service.py     # Cloudflare R2
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   └── transcribe_task.py     # Celery async task
│   │   ├── middleware/
│   │   │   ├── auth_middleware.py
│   │   │   └── cors_middleware.py
│   │   └── utils/
│   │       ├── deps.py                # FastAPI dependencies
│   │       └── security.py            # Password hashing
│   ├── alembic/                       # DB migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   ├── test_patients.py
│   │   └── test_transcription.py
│   ├── celery_worker.py
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env
│   └── Dockerfile
│
├── docker-compose.yml                 # Local dev (postgres + redis)
├── .gitignore
└── README.md
```

---

## PART 5: CURSOR PROMPTS

Use each prompt below in Cursor. They are designed to be copy-pasted directly.

---

### PROMPT 1 — Project Bootstrap & Backend Setup

```
You are building a Hospital Management System backend using FastAPI (Python).

Create the complete backend project inside a `backend/` directory with this exact structure:
- app/main.py (FastAPI app with CORS, routers included)
- app/config.py (using pydantic-settings, reads from .env)
- app/database.py (SQLAlchemy async engine with PostgreSQL)
- app/models/ (SQLAlchemy ORM models for: User, Patient, Appointment, MedicalRecord, Prescription, Transcription, Vitals)
- app/schemas/ (Pydantic v2 schemas for all models with proper validation)
- app/routers/ (separate router files: auth, patients, appointments, records, transcriptions, dashboard)
- app/services/ (auth_service, patient_service, transcription_service, storage_service)
- app/utils/deps.py (FastAPI dependency injection: get_db, get_current_user, require_role)
- app/utils/security.py (bcrypt password hashing, JWT creation/verification)
- requirements.txt
- .env.example
- alembic.ini + alembic/env.py

Database schema requirements:
- users: id (UUID), email, password_hash, role (enum: admin/doctor/nurse/receptionist), full_name, is_active, created_at
- patients: id (UUID), mrn (auto-generated unique string), full_name, date_of_birth, gender, phone, address, blood_group, emergency_contact_name, emergency_contact_phone, created_at, updated_at
- appointments: id (UUID), patient_id (FK), doctor_id (FK→users), scheduled_at, status (enum: scheduled/completed/cancelled/no_show), chief_complaint, notes, created_at
- medical_records: id (UUID), patient_id (FK), doctor_id (FK→users), appointment_id (FK nullable), diagnosis, notes, created_at
- prescriptions: id (UUID), medical_record_id (FK), medication_name, dosage, frequency, duration_days, instructions
- vitals: id (UUID), patient_id (FK), recorded_by (FK→users), blood_pressure_systolic, blood_pressure_diastolic, heart_rate, temperature_celsius, weight_kg, height_cm, recorded_at
- transcriptions: id (UUID), medical_record_id (FK nullable), audio_file_url, raw_transcript, cleaned_transcript, language_detected, status (enum: pending/processing/completed/failed), duration_seconds, created_at

JWT auth: access token (15min) + refresh token (7 days) stored in httpOnly cookies.
Role-based access: admin sees everything, doctor sees their patients, nurse/receptionist limited access.

Use async SQLAlchemy with asyncpg driver. Include proper error handling (HTTPException with meaningful messages). All routes should have proper response_model, status_code, and tags for auto-documentation.
```

---

### PROMPT 2 — AI Transcription Service (Whisper + Claude)

```
Inside backend/app/services/transcription_service.py, build the complete AI transcription pipeline.

Requirements:
1. Accept audio files (webm, mp3, wav, m4a) up to 50MB
2. Upload audio to Cloudflare R2 (using boto3 with S3-compatible endpoint)
3. Send audio to OpenAI Whisper API (model: whisper-1) with language hint supporting both Urdu and English
4. Post-process with Claude API (claude-sonnet-4-20250514) using this exact system prompt:

SYSTEM PROMPT FOR CLAUDE:
"""
You are a medical transcription specialist for a hospital in Pakistan. You receive raw speech-to-text output that may contain:
- Code-switching between Urdu and English (common in Pakistani medical settings)
- Medical terminology in either language
- Informal speech patterns, filler words, repetitions

Your job is to:
1. Produce a clean, professional English transcription
2. Translate any Urdu portions into English accurately
3. Preserve all medical terms, drug names, and dosages exactly
4. Structure the output as a medical note with these sections if detectable:
   - Chief Complaint
   - History of Present Illness  
   - Examination Findings
   - Assessment/Diagnosis
   - Plan/Prescription
5. Remove filler words (um, uh, acha, theek hai used as fillers)
6. Fix obvious transcription errors using medical context
7. Return ONLY the cleaned transcription, no commentary

If the audio is purely administrative (appointment booking, reception queries), just return a clean English paragraph without medical sections.
"""

5. Save both raw and cleaned transcript to the transcriptions table
6. Return structured response: { transcription_id, raw_transcript, cleaned_transcript, language_detected, sections: {chief_complaint, history, examination, assessment, plan} }

Also create:
- backend/app/tasks/transcribe_task.py: Celery task for async transcription (for longer audio files >30 seconds)
- backend/app/routers/transcriptions.py: 
  - POST /api/transcribe (upload + sync for <30s files)
  - POST /api/transcribe/async (upload + return job_id for longer files)
  - GET /api/transcribe/{job_id}/status (polling endpoint)
  - GET /api/transcribe/{transcription_id} (get completed transcription)
  - GET /api/patients/{patient_id}/transcriptions (list patient transcriptions)

Include proper error handling for: API rate limits, unsupported audio formats, network failures.
```

---

### PROMPT 3 — Frontend Setup (Next.js 14)

```
Create a complete Next.js 14 (App Router) frontend inside a `frontend/` directory for a Hospital Management System.

Tech stack:
- Next.js 14 with TypeScript
- Tailwind CSS + shadcn/ui (use `npx shadcn-ui@latest init` setup)
- Zustand for state management
- React Hook Form + Zod for forms
- Axios for API calls with interceptors
- Recharts for dashboard charts

Design language:
- Clean, clinical aesthetic — primarily white and cool gray (#F8FAFC background)
- Accent color: deep teal (#0F766E) for primary actions
- Typography: DM Sans for UI, DM Mono for patient IDs and medical codes
- Sidebar navigation on desktop, bottom nav on mobile
- Data-dense but breathable — medical dashboards need information density without clutter

Create these files:

1. frontend/app/(auth)/login/page.tsx
   - Clean login form with email + password
   - Role selection shown after login based on JWT payload
   - Show hospital logo/name prominently

2. frontend/app/(dashboard)/layout.tsx
   - Persistent sidebar with nav items: Dashboard, Patients, Appointments, Transcriber, Records, Settings
   - Top header with: search bar, notifications bell, user avatar + role badge
   - Collapsible sidebar for more screen space

3. frontend/app/(dashboard)/page.tsx (Dashboard)
   - Stats cards: Total Patients Today, Appointments, Pending Records, Active Doctors
   - Recent appointments list
   - Patient registration trend chart (last 30 days)
   - Quick action buttons: New Patient, New Appointment, Open Transcriber

4. frontend/lib/api.ts
   - Axios instance with baseURL from env
   - Request interceptor: attach Bearer token from Zustand store
   - Response interceptor: handle 401 (refresh token or redirect to login)

5. frontend/store/authStore.ts (Zustand)
   - State: user, token, isAuthenticated, role
   - Actions: login, logout, refreshToken

6. frontend/types/index.ts
   - TypeScript interfaces for: User, Patient, Appointment, MedicalRecord, Prescription, Transcription, Vitals

7. frontend/hooks/usePatients.ts
   - Custom hook for patient CRUD with loading/error states

Include .env.local.example with NEXT_PUBLIC_API_URL variable.
Generate package.json with all required dependencies.
```

---

### PROMPT 4 — Patient Management Pages

```
Build the complete Patient Management UI for the HMS frontend.

Create these components and pages:

1. frontend/components/patients/PatientTable.tsx
   - Data table with columns: MRN, Full Name, Age, Gender, Phone, Blood Group, Last Visit, Actions
   - Sortable columns, search/filter bar
   - Pagination (20 per page)
   - Row click → navigate to patient detail page
   - "Register New Patient" button in header

2. frontend/app/(dashboard)/patients/page.tsx
   - Uses PatientTable
   - URL-based search params for filter state (searchable by name, MRN, phone)
   - Loading skeleton states

3. frontend/components/patients/PatientForm.tsx
   - Full patient registration form with React Hook Form + Zod validation
   - Fields: Full Name, Date of Birth, Gender (select), Phone, Address (textarea), Blood Group (select: A+/A-/B+/B-/O+/O-/AB+/AB-), Emergency Contact Name, Emergency Contact Phone
   - On submit: POST /api/patients
   - Show generated MRN after successful registration

4. frontend/app/(dashboard)/patients/new/page.tsx
   - Wraps PatientForm in a card with back navigation

5. frontend/app/(dashboard)/patients/[id]/page.tsx
   - Patient header: name, MRN badge, age, gender, blood group tag
   - Tabs: Overview | Medical Records | Vitals | Appointments | Transcriptions
   - Overview tab: all basic info + latest vitals summary card
   - Vitals tab: table + simple line chart (heart rate, BP trend)
   - Medical Records tab: collapsible record cards with prescriptions inside
   - Transcriptions tab: list of AI transcriptions linked to records

6. frontend/components/patients/VitalsForm.tsx
   - Quick vitals entry: BP systolic/diastolic, heart rate, temperature (°C), weight (kg), height (cm)
   - Sheet/drawer that slides in from the right
   - POST /api/patients/{id}/vitals on submit

Validation rules (Zod):
- Phone: Pakistani format (+92XXXXXXXXXX or 0XXXXXXXXXX)
- Date of Birth: cannot be in future, must be >0 years old
- Blood pressure: systolic 60-250, diastolic 40-150
- Heart rate: 20-300 bpm
- Temperature: 30-45°C
```

---

### PROMPT 5 — AI Transcriber UI Component

```
Build the AI Transcriber page for the HMS. This is the most complex UI component.

File: frontend/app/(dashboard)/transcriber/page.tsx
Supporting components in frontend/components/transcriber/

FEATURE REQUIREMENTS:

1. AudioRecorder.tsx component:
   - Uses MediaRecorder API (browser built-in, no external library)
   - Visual waveform animation while recording (CSS animation simulating audio wave)
   - Recording timer display (MM:SS format)
   - Three states: idle → recording → processing
   - Buttons: "Start Recording" (microphone icon) | "Stop & Transcribe" | "Upload Audio File" (file input as alternative)
   - Supported formats note: "Works with Urdu and English"
   - Audio playback before submitting (let doctor review recording)
   - Max recording time: 10 minutes (auto-stop with warning at 9 min)

2. TranscriptDisplay.tsx component:
   - Split view: left panel = Raw Transcript, right panel = Cleaned Medical Note
   - Cleaned note shows structured sections if detected: Chief Complaint, History, Examination, Assessment, Plan
   - Each section is a collapsible card
   - "Copy to Clipboard" button for each section
   - "Attach to Patient Record" button → opens patient search modal → links transcription to patient
   - Status indicator: Pending → Processing → Complete (with animated states)
   - Language detected badge (e.g., "Urdu-English mixed" or "English")

3. TranscriptionHistory.tsx component:
   - List of recent transcriptions (last 10) with: date, patient name if linked, duration, status badge
   - Click to expand and view transcript
   - Filter by: All, Linked to Patient, Unlinked

4. Full page layout:
   - Left column (60%): Recorder + Transcript Display
   - Right column (40%): History + Quick Actions
   - On mobile: stack vertically

5. frontend/hooks/useAudioRecorder.ts custom hook:
   - State: isRecording, duration, audioBlob, audioUrl, status, error
   - Methods: startRecording(), stopRecording(), resetRecording()
   - Handles MediaRecorder lifecycle, cleanup on unmount
   - Returns audio as WebM blob for upload

6. API integration:
   - For recordings <30s: POST /api/transcribe (await response, show result immediately)
   - For recordings >30s: POST /api/transcribe/async → poll GET /api/transcribe/{job_id}/status every 2 seconds
   - Show a live progress indicator during processing

Style the recorder button with a pulsing red animation while recording. Make the UI feel professional but approachable — this is used by doctors who may not be tech-savvy.
```

---

### PROMPT 6 — Authentication, RBAC & Protected Routes

```
Implement complete authentication and role-based access control for the HMS frontend.

1. frontend/middleware.ts (Next.js middleware)
   - Protect all /dashboard/* routes
   - Redirect unauthenticated users to /login
   - Check JWT expiry from cookie
   - Role-based route protection:
     - /dashboard/settings → admin only
     - /dashboard/transcriber → doctor, admin
     - /dashboard/patients/new → receptionist, admin, doctor
     - All other dashboard routes → any authenticated user

2. frontend/store/authStore.ts (Zustand with persistence)
   - Persist token to localStorage
   - Store: { user: User | null, accessToken: string | null, isAuthenticated: boolean }
   - login(email, password) → POST /api/auth/login → store tokens
   - logout() → POST /api/auth/logout → clear state
   - refreshToken() → POST /api/auth/refresh → update access token

3. frontend/components/layout/RoleGuard.tsx
   - Wrapper component: <RoleGuard roles={['admin', 'doctor']}>
   - Shows 403 message if user doesn't have required role
   - Shows children if authorized

4. frontend/app/(auth)/login/page.tsx
   - Form: email + password
   - On success: redirect based on role:
     - admin → /dashboard
     - doctor → /dashboard/patients
     - receptionist → /dashboard/appointments
     - nurse → /dashboard/patients

5. Backend auth routes (backend/app/routers/auth.py):
   - POST /api/auth/login → { access_token, refresh_token, user: {id, email, role, full_name} }
   - POST /api/auth/refresh → { access_token } (reads refresh_token from httpOnly cookie)
   - POST /api/auth/logout → clear refresh token cookie
   - GET /api/auth/me → current user info
   - POST /api/auth/register (admin only) → create new staff user

Include rate limiting on login endpoint (5 attempts per minute per IP using slowapi).
```

---

### PROMPT 7 — Docker, Deployment & Environment Config

```
Create all deployment configuration for the HMS system.

1. docker-compose.yml (local development):
   - postgres:16 service with volume, exposed on 5432
   - redis:7-alpine service, exposed on 6379
   - Environment variables via .env file
   - Health checks for both services

2. backend/.env.example:
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/hms_db
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-256-bit-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
CLOUDFLARE_R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=your-r2-access-key
CLOUDFLARE_R2_SECRET_KEY=your-r2-secret-key
CLOUDFLARE_R2_BUCKET_NAME=hms-audio
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.vercel.app
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

3. backend/Dockerfile:
   - Python 3.12 slim base
   - Install ffmpeg (required by Whisper for audio processing)
   - Copy requirements.txt, install deps
   - Expose port 8000
   - CMD: uvicorn app.main:app --host 0.0.0.0 --port 8000

4. frontend/.env.local.example:
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=Hospital Management System

5. backend/render.yaml (Render.com deployment config):
   - Web service for FastAPI (uses Dockerfile)
   - Worker service for Celery
   - Environment variables reference

6. README.md with:
   - Prerequisites: Docker, Node 20+, Python 3.12+
   - Local setup: docker compose up -d → cd backend && pip install -r requirements.txt && alembic upgrade head → cd frontend && npm install && npm run dev
   - First admin user creation: python -m app.utils.create_admin
   - Deployment steps for Render (backend) + Vercel (frontend) + Supabase (database)

7. backend/app/utils/create_admin.py:
   - Script to create first admin user when bootstrapping
   - Takes email + password as CLI args or prompts interactively
```

---

### PROMPT 8 — Appointment Scheduling

```
Build the appointment scheduling module for the HMS.

Backend (backend/app/routers/appointments.py):
- GET /api/appointments → list with filters: date, doctor_id, status, patient_id
- POST /api/appointments → create (receptionist, admin, doctor)
- GET /api/appointments/{id} → detail
- PATCH /api/appointments/{id} → update status/notes
- DELETE /api/appointments/{id} → cancel
- GET /api/appointments/slots/{doctor_id}?date=YYYY-MM-DD → available 30-min slots in working hours (9am-5pm)

Frontend components:

1. frontend/app/(dashboard)/appointments/page.tsx
   - Today's appointments list as default view
   - Filter by: date (date picker), doctor (dropdown), status
   - Table columns: Time, Patient Name, Doctor, Chief Complaint, Status badge, Actions

2. frontend/components/appointments/AppointmentForm.tsx
   - Patient search (autocomplete by name/MRN)
   - Doctor selection (dropdown of users with doctor role)  
   - Date + time slot selection (show available slots in grid, disable taken ones)
   - Chief complaint textarea
   - On submit: POST /api/appointments

3. Appointment status color coding:
   - scheduled: blue
   - completed: green
   - cancelled: red  
   - no_show: orange

Make slots load dynamically when doctor + date is selected.
```

---

## PART 6: IMPLEMENTATION ORDER

Follow this sequence to avoid dependency issues:

1. **Week 1**: Docker setup + Database + Backend models + Alembic migrations
2. **Week 1**: Auth system (JWT) + basic user CRUD
3. **Week 2**: Patient CRUD API + Patient UI pages
4. **Week 2**: Appointment API + Appointment UI
5. **Week 3**: Transcription service (Whisper + Claude integration)
6. **Week 3**: Transcriber UI component + AudioRecorder
7. **Week 4**: Medical Records + Prescriptions + Vitals
8. **Week 4**: Dashboard stats + Charts
9. **Week 5**: Testing + RBAC enforcement + Error handling
10. **Week 5**: Deployment (Render + Vercel + Supabase)

---

## PART 7: KEY ENVIRONMENT NOTES FOR PAKISTAN/URDU SUPPORT

- Whisper API: always pass `language: "ur"` as hint when recording in Urdu mode, or omit for auto-detection
- Claude prompt explicitly handles Pakistani code-switching (Urdu-English mixed speech)
- Phone validation: support both `+92` and `0` prefixed Pakistani numbers
- Dates: use DD/MM/YYYY display format (common in Pakistan) but store as ISO 8601
- Timezone: `Asia/Karachi` (PKT, UTC+5) — set in backend config and frontend date formatting

---

*Generated for Cursor AI — Each prompt in Part 5 is a complete, self-contained instruction set. Paste them into Cursor's chat one at a time in the order shown.*
