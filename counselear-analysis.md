# CounselEAR — Technical Teardown

> Reverse‑engineering notes from an authenticated walkthrough of **counselear.com**
> (account `hafiz@hirelinea.ai`), 2026‑08‑21. Everything here was observed through
> **normal use of the app** — response headers, cookies, loaded scripts, the public
> navigation map, and the AJAX calls the app itself fires. No security probing was
> performed and **no real patient records (PHI) were opened or captured**. Items I
> could directly confirm are marked *confirmed*; architectural conclusions drawn from
> those signals are marked *inferred*.

---

## 1. What the product is

**CounselEAR** (CounselEAR LLC / "CounselEAR Complete OMS") is a vertical **SaaS practice‑management + EHR system built specifically for audiology / hearing‑healthcare clinics.** It bundles three things the marketing copy calls out explicitly:

- **OMS** — Office Management System (scheduling, patients, billing, inventory)
- **PMS** — Practice Management System (business reporting, claims, payments)
- **Report Writing System** — audiology‑specific clinical report authoring (audiograms, professional & patient reports, chart notes)

It is **multi‑tenant** (each clinic/company registers its own account — see the "Register your clinic account" link) and **multi‑clinic / multi‑region** within a tenant (there are `Clinics`, `Regions`, and per‑user role modules).

The account used appears connected to **"Linea AI"** (the `hirelinea.ai` domain), which surfaces in‑app as an AI feature alongside CounselEAR's own **AI Templates** and **CounselEAR Insight** modules — i.e. an AI layer is being added on top of the legacy system.

---

## 2. Hosting & infrastructure (*confirmed via headers + cookies*)

| Signal | Evidence | Conclusion |
|---|---|---|
| Web server | `Server: Microsoft-IIS/10.0` | **IIS 10** on Windows Server 2016+ |
| Runtime | `X-AspNet-Version: 4.0.30319`, `X-Powered-By: ASP.NET` | **.NET Framework 4.x** (not .NET Core) |
| Load balancing | `AWSALB`, `AWSALBCORS` cookies | Runs on **AWS behind an Application Load Balancer** with sticky sessions |
| CDN / assets | `cdn.counselear.com`, `*.cloudfront.net` | **Amazon CloudFront** for bundled JS/CSS and the Telerik script farm |
| Transport security | `Strict-Transport-Security: max-age=31536000` | **HSTS** enabled (forces HTTPS) |
| Clickjacking | `X-Frame-Options: SAMEORIGIN` | Frame‑embedding restricted to same origin |
| Caching | `Cache-Control: no-cache, no-store, must-revalidate`, `Expires: -1` | Authenticated pages are explicitly non‑cacheable (sensible for PHI) |

**Net:** a stateful, sticky‑session ASP.NET WebForms application on AWS EC2/IIS behind an ALB, with static assets pushed to CloudFront. The ALB stickiness (`AWSALB`) is *required* because WebForms in‑process session + ViewState assume server affinity.

---

## 3. Backend architecture

### 3.1 Framework — ASP.NET **WebForms** (*confirmed*)

Every page is a classic `.aspx` WebForms page. The confirming fingerprints:

- Hidden fields `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTTARGET`, `__EVENTARGUMENT` on every page.
- **ViewState is large and stateful** — 2 KB on the login page, **~30 KB** on a data‑bound admin page. State is round‑tripped through the browser on every postback.
- Navigation like `Forgot Password?` → `javascript:__doPostBack('lnkForgotPassword','')` — the WebForms postback event model.
- The **2‑step login is a server postback**, not a client SPA transition (email → server postback → password field re‑rendered).

This is a **server‑rendered, postback‑driven** app — the opposite of a modern SPA. There is **no REST API and no WCF** (`.svc`) surface in normal use (*confirmed*: zero `/api/*`, `.json`, or `.svc` requests observed).

### 3.2 The "shell + page" routing trick (*confirmed*)

The whole app runs through a **single container page** that swaps content by query string:

```
/Controls/Pages/Public/Index.aspx?page=Features        ← anonymous area
/Controls/Pages/Secure/Index.aspx?page=Home            ← authenticated area
/Controls/Pages/Secure/Index.aspx?page=Patients/Search
/Controls/Pages/Secure/Index.aspx?page=Admin/Users
```

`Index.aspx` reads the `page` parameter and **loads the corresponding ASP.NET User Control (`.ascx`)** into the page body server‑side (the `page` value maps 1:1 to a control path like `Patients/Search`, `Admin/AppointmentTypes`, `Business/Reports/Invoices/ARAgingSummaryReport`). *Inferred but strongly supported* by the folder‑style `page=` values and the `Public` vs `Secure` split enforcing the auth boundary at the container level.

Module‑to‑module navigation is a **full page GET** (plain `<a href>`), while **within** a page, partial updates are handled by ASP.NET AJAX UpdatePanels + Telerik AJAX + ASMX services (below).

### 3.3 AJAX data layer — **ASMX "ScriptServices"** (*confirmed*)

The dashboard is a set of configurable **widgets**, and each widget is backed by its **own ASMX web service** returning JSON via jQuery AJAX:

```
POST /WebServices/Widgets/PatientStatusWidgetWS.asmx/filterChanged
POST /WebServices/Widgets/PatientVisitWidgetWS.asmx/filterChanged
POST /WebServices/Widgets/ReferralWidgetWS.asmx/filterChanged
POST /WebServices/Widgets/SentReportWidgetWS.asmx/filterChanged
POST /WebServices/Widgets/PQRSWidgetWS.asmx/filterChanged            (MIPS/PQRS quality)
POST /WebServices/Widgets/PatientLastReviewWidgetWS.asmx/filterChanged
POST /WebServices/Widgets/OpportunityVisitsTNTWidgetWS.asmx/filterChanged   (TNT = "Tested, Not Treated" sales pipeline)
```

These are **`[ScriptService]` ASMX endpoints** (the classic .NET pattern where a web method is POSTed JSON and replies with a JSON envelope `{ "d": ... }`). Each widget has a `filterChanged` method — the client posts the new filter (date range / user / type) and gets back refreshed HTML/data.

Other server endpoints observed:

- **`/webservices/twilio/chat/TokenWS.ashx`** — a generic **ASHX HTTP handler** that mints **Twilio access tokens** server‑side for the in‑app messaging SDK (so the Twilio secret never reaches the browser).
- **`WebResource.axd` / `Telerik.Web.UI.WebResource.axd`** — the standard ASP.NET + Telerik embedded‑resource handlers for scripts/styles.
- **`supportTicketsWebServerHostname` cookie** — the *Support Tickets* module talks to a **separate web‑server host**, i.e. that subsystem is split out onto its own server/service.

### 3.4 Authentication & session (*confirmed signals, mechanism inferred*)

- **Login flow:** two‑step (enter email → server postback → enter password → `POST` → **302 redirect** to `…/Secure/Index.aspx?page=Home&login=true`). Splitting email/password across a postback is typical of tenant‑aware login (the email lets the server resolve the company/SSO path before asking for a password).
- **Auth cookie is HttpOnly** — the ASP.NET Forms‑authentication ticket (`.ASPXAUTH`) and `ASP.NET_SessionId` were **not** visible to JavaScript (good practice). *Inferred:* **Forms Authentication** with an encrypted auth ticket.
- **`SESSION_AUTH_TIMESTAMP` cookie** — a custom **idle/absolute session‑timeout** tracker layered on top of Forms auth (auto‑logout for HIPAA hygiene).
- **`username`, `gmtOffset`, `userLocale`** cookies — lightweight per‑user context cached client‑side (used to localize times/labels without a round trip).

### 3.5 Data & state persistence patterns

- **Dashboard filter state lives in cookies**, one set per widget: `widgetPatientStatusMonth/Year/User/Type`, `widgetSentReportRange/User/Type/Failed`, `widgetOpportunitiesVisitsTNTRange/User/PatientTags…`, `widgetPatientVisitRange/User`, `widgetVisitStatus`, `widgetReferralPeriod`, `widgetPQRSType`, `widgetLastReviewRange/Status`. So a user's dashboard configuration is remembered browser‑side rather than (or in addition to) server‑side. (*confirmed*)
- **The database is not directly observable**, but the reporting surface (A/R aging, remittance, claim adjustments, commission tracking, sales analytics by device/line‑item/payment) implies a **normalized relational schema on SQL Server** — the natural pairing with this stack. (*inferred*)

---

## 4. Frontend architecture

### 4.1 Rendering model

Server‑rendered HTML from WebForms. **Layout is table‑based** — a single admin page contained **51 `<table>` elements** (nested tables for layout, the hallmark of a legacy WebForms UI). There is **no client‑side framework**: *confirmed absence* of React, Angular, Vue, Knockout, and Bootstrap. The `<meta http-equiv="X-UA-Compatible" content="IE=9">` tag pins rendering to an old IE mode and dates the codebase's foundation.

### 4.2 Client libraries (*confirmed via loaded scripts / globals*)

| Library | Version | Role |
|---|---|---|
| **jQuery** | **1.7.1** (2011) | Core DOM/AJAX |
| **jQuery UI** | **1.8.9** (2011) | Dialogs/modals (`ui-dialog-*` seen), datepickers |
| **Telerik UI for ASP.NET AJAX (RadControls)** | **2014.1.225** (2014 Q1) | Server controls: RadAutoCompleteBox, RadScheduler/RadGrid/RadWindow family, `RadScriptManager`; served from CloudFront |
| **ASP.NET AJAX** (`Sys.WebForms.PageRequestManager`) | 4.x | UpdatePanel partial postbacks |
| **jQWidgets (jqx)** | bundled | Data grids / rich widgets on data‑heavy pages |
| **TinyMCE** | build `v=286` (old) | Rich‑text editor for the **report‑writing** module |
| **jSignature** | v2 | Canvas **signature capture** (consents / patient sign‑off) |
| **Twilio Conversations SDK** | 2.4.0 | Two‑way **patient messaging / chat** |
| **SignalR** (jQuery.connection) | — | Real‑time push (unread counts / notifications) — *inferred from `jQuery.connection` + `userChatUnreadChannel` cookie* |

Assets are **bundled and cache‑busted by version** (`bundle-v110.js`, `bundle-v71.css`, `Header-min-v47.js`, `Chat-min-v28.js`) and shipped from `cdn.counselear.com`.

### 4.3 UI interaction patterns

- **Modals** are jQuery‑UI dialogs pre‑rendered into the page with GUID‑suffixed ids (e.g. `dialogPatientTagList<guid>`, `frmPatientTagList<guid>`) — a server control instantiated per row/item.
- **Autocomplete** search boxes use Telerik `RadAutoCompleteBox`.
- **Grids/lists** use a mix of `asp:GridView`‑style server tables and jqxWidgets grids depending on the page.
- **Partial refresh** inside a page = UpdatePanel async postback (full ViewState round‑trip) or a widget ASMX call; **switching modules = full page load**.

---

## 5. Feature map (the module surface)

Extracted from the authenticated navigation (128 `page=` routes). Grouped:

### Clinical / front office
- **Dashboard** (`Home`) — configurable widget board (patient status, visits, referrals, sent reports, PQRS/MIPS, "opportunities" pipeline, last‑review).
- **Schedule** (`Schedule`) — appointment calendar (Telerik scheduler); config via **Appointment Rooms**, **Appointment Types**, **Schedule Options**.
- **Patients** — `New Patient`, `Search Patients`, **Patient Visits** (`VisitActivity`).
- **Leads / CRM** — `New Lead`, `View Leads`, plus "Opportunity Reasons" and the TNT ("Tested, Not Treated") pipeline widget — a **sales/marketing funnel** bolted onto the clinical record.
- **Report writing** — "Incomplete Patient Visits", "Unsent Professional Reports", "Unsent Patient Reports" queues (the audiology report‑authoring workflow; TinyMCE + templates).

### Business / reporting (a very deep suite)
- **Report Generator** (ad‑hoc detail reports) for: Patients, Appointments, Visits, Questionnaires, Devices, Stock, To‑Do Tasks, Policies, Invoices, Line Items, Payments, Claims.
- **Summary Reports** parameterized by `type=` (appt / device / stock / todotask / lineitem / payment / claim).
- **Appointments:** Life‑Cycle Summary.
- **Invoices / sales:** A/R Aging Summary, Hearing‑Aid Sales Summary & Detail, **Sales Analytics**, Total Sales Summary.
- **Line items:** Detail + **Commission Tracker / Commission Payment** (staff commissions on device sales).
- **Payments:** Detail + Summary; **CounselEAR Pay** (integrated card processing / payment application).
- **Insurance claims:** Claim Detail, **Claim Remittance** (ERA), **Provider Adjustments** — a full medical‑billing/claims workflow.
- **Report Pickup** — batched report retrieval.

### Admin / configuration (extensive reference‑data management)
- **Org:** Clinics, Clinic Documents, Regions.
- **Access control:** **Users**, **User Roles** (RBAC), User Profile.
- **Scheduling config:** Appointment Rooms/Types, Schedule Options.
- **Billing config:** Invoice Options/Notes/Note Bundles/Statuses, Discount (Adjustment) Types, Tax Rates, Payer List (Insurance Payers), Payer Types, Payment Method Subtypes.
- **Catalog / inventory:** Line Item List/Types/Bundles, Device Purchase Types, Device Tags, **Hearing Aid Technologies**, **Loaner Devices**.
- **To‑Do system:** Subscriptions, Tasks.
- **Audiology‑specific clinical config:** **Audiometers**, **Transducers**, **OAE Configuration**, **Word Lists** (speech audiometry), **Results Templates**, **History Templates**, **Visit Options**, **V‑Tracker Types**, **CounselEAR Insight** (Characteristics), **MIPS Measures** (Medicare quality reporting).
- **AI:** **AI Templates**, and the **"Linea AI"** entry point.
- **Support:** in‑app Support Tickets (on a separate host).

---

## 6. Third‑party integrations (*confirmed via loaded scripts / cookies*)

- **Twilio Conversations** — two‑way SMS/chat with patients; tokens minted by `TokenWS.ashx`.
- **Freshchat (Freshworks)** — in‑product support chat widget.
- **CallRail** (`calltrk.com` swap.js + external_forms) — **call tracking & marketing attribution** (dynamic number insertion; `calltrk_*` cookies).
- **Google Tag Manager / GA4** (`G-04H40596F2`) — web analytics.
- **CounselEAR Pay** — embedded payment processing.
- **ModMed** integration flag (`IsModMed` cookie) — interop with **Modernizing Medicine** (EHR/ONC ecosystem).
- **Phonak / Sonova** flag (`IsPhonak` cookie) — hearing‑aid manufacturer integration (e.g. device ordering / Noah‑style data).
- **TinyMCE** (report authoring) and **jSignature** (signature capture) as embedded clinical tooling.

---

## 7. Security & compliance observations

Because this stores PHI (a HIPAA context), the security posture matters. What I could observe from normal use:

**Good:**
- HTTPS enforced with **HSTS** (1‑year).
- **Auth ticket + session id are HttpOnly** (not script‑readable).
- **`X-Frame-Options: SAMEORIGIN`** (anti‑clickjacking).
- Authenticated pages are **`no-store`** (won't linger in browser/proxy caches).
- A **custom session‑timeout** (`SESSION_AUTH_TIMESTAMP`) for idle auto‑logout.
- Twilio secrets kept server‑side (token handler pattern).
- The `Public`/`Secure` container split centralizes the auth boundary.

**Risks / tech debt (worth flagging):**
- **Very old client libraries** — jQuery **1.7.1** and jQuery UI **1.8.9** (2011) and Telerik **2014.1.225** have known published CVEs (jQuery XSS via `$.html`/selector handling; older Telerik ASP.NET AJAX has serious historical vulnerabilities in `Telerik.Web.UI.WebResource.axd`/`DialogHandler`/`RadAsyncUpload`). Even if patched server‑side, the surface is dated. This is the single biggest thing I'd audit.
- **`X-UA-Compatible: IE=9`** signals a codebase anchored to legacy IE behavior.
- **CSRF protection** relies on ASP.NET ViewState/event validation rather than an explicit anti‑forgery token in the AJAX calls (I did not see a distinct CSRF token header on the ASMX widget POSTs). Worth verifying that state‑changing ASMX/handlers validate the auth cookie + origin.
- **No `Content-Security-Policy`** header was present on the responses observed.
- Heavy **ViewState** (~30 KB/page) is a performance cost (bandwidth + server (de)serialization) and, if MAC/encryption were ever misconfigured, a classic ASP.NET risk vector.

*(These are surface‑level observations from headers and loaded assets, not a penetration test.)*

---

## 8. How it all fits together (one‑paragraph mental model)

A user hits `Login.aspx`, authenticates in two server postbacks, and receives an HttpOnly Forms‑auth cookie; the ALB pins them to one IIS node. Every screen thereafter is `Secure/Index.aspx?page=<Folder/Control>`, which server‑side loads the matching `.ascx` user control into a shared shell — so "routing" is really a query‑string switch over user controls, with the `Public`/`Secure` folders enforcing the auth boundary. The page renders as server HTML (table layout, jQuery + Telerik + jqxWidgets), carrying ViewState for stateful postbacks. Interactive bits update without full navigation via **UpdatePanels** and **per‑widget ASMX ScriptServices** (`*WS.asmx/filterChanged`) that return JSON; dashboard filter choices are remembered in cookies. Cross‑cutting real‑time/comms features (patient SMS/chat, support chat, notifications) are delegated to **Twilio + Freshchat (+ SignalR)**, payments to **CounselEAR Pay**, and marketing/analytics to **CallRail + GA4**. On top of this mature (~2011–2014‑era) WebForms core, newer capabilities — **AI Templates / CounselEAR Insight / "Linea AI"**, ModMed & Phonak integrations — are being layered in.

---

## 9. Relevance to your HMS (quick takeaways)

Since you're building an eye‑clinic HMS, a few contrasts worth noting:

- **Their stack is the legacy end of the spectrum** (WebForms/ViewState/jQuery‑1.x) vs your modern **FastAPI + Next.js**. Your architecture is far more maintainable; their advantage is **domain depth**, not tech.
- The thing to *emulate* is the **breadth of the domain model**: claims/remittance (ERA), A/R aging, commission tracking, catalog/inventory with device‑specific attributes, per‑visit clinical templates, and MIPS/quality reporting. That depth is what makes vertical health SaaS sticky.
- The **configurable widget dashboard** (each widget = its own service + persisted filters) is a clean pattern you could mirror with your React Query hooks (one hook/endpoint per widget), *without* the cookie sprawl — persist filter state in the URL or a small settings table instead.
- The **"Tested, Not Treated" sales pipeline + Leads/Opportunities** grafted onto the clinical record is a smart revenue feature (CRM inside the EHR).
- Their **security debt** (ancient jQuery/Telerik, IE9 mode, no CSP) is exactly what your greenfield build should avoid from day one — you already have HttpOnly cookies, refresh‑token rotation, and CSP‑friendly Next.js.

---

*Prepared from an authenticated functional walkthrough only. No patient data was accessed, exported, or stored; conclusions about server‑internal code and the database are inferences from externally observable behavior.*
