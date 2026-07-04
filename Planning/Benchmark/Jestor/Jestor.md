# Jestor Benchmark Study

> **Product:** Solo | Jestor
> **URL:** https://jestor.com/
> **Description:** AI for business processes (IA para processos de negócios)
> **Study Date:** 2026-07-03
> **Source:** Full front-end bundle analysis (HTML + minified JS)

---

## 1. Product Overview

Jestor is a Brazilian no-code/low-code platform for building business applications. The product analyzed is **"Solo"** — likely their core SaaS offering. It competes directly with Airtable, Monday.com, and Pipefy, with strong localization for the Brazilian market (CNPJ, CPF, Address fields, Portuguese UI).

---

## 2. Relational Table Strategy

This is the most relevant area for Sales Engine. Jestor implements a **connected records** model with explicit relationship types:

### 2.1 Relationship Types

| Type | Label | Description |
|------|-------|-------------|
| N:1 | Connected records (N:1) | Many records in this table link to one in another table |
| 1:1 | (1:1) | One-to-one relationship between records |
| N:M | (N:M) | Many-to-many with bidirectional connection |

### 2.2 Implementation

- **Connected Tables**: Tables explicitly linked via relationship fields
- **Bidirectional Connection**: Relationships sync in both directions
- **Lookup Fields**: Pull values from a connected record's fields (read-only)
- **Roll-Up Fields**: Aggregate values from connected records (Sum, Count, Average, Min, Max)
- **Formulas with Connected Data**: Formulas can reference fields across connected records

### 2.3 Field Types for Relations

- **Connected Records (N:1)** — Select a single record from another table
- **Multiple Users** — User selection (multi-value)
- **User Attribution** — Auto-assign record to a user
- **Record Button actions** — Open, Clone, Copy, Link, Update connected records

### 2.4 What Sales Engine Can Learn

> **Current Sales Engine state:** Custom tables exist with basic fields but NO relationship system.

**Implementation opportunities:**
1. **Relationship field type** — A `connected_record` column kind that links to another table, with selectable target table
2. **Bidirectional sync** — When record A links to B, B automatically shows linked records from A
3. **Lookup fields** — Read-only fields that mirror a value from a connected record (e.g., show "Client Name" from a linked client record)
4. **Roll-up fields** — Aggregate functions over related records (count of tasks per project, sum of deal values per client)
5. **N:M junction tables** — Auto-generated intermediate table for many-to-many relationships

---

## 3. Apps Builder

### 3.1 Builder Components

Jestor has a visual **Builder** for assembling custom business apps:

- **Tables** — The core data structure (equivalent to database tables)
- **Kanbans** — Visual pipeline/kanban views over table data
- **Forms** — Custom form views for data entry
- **Automations** — Rules engine with triggers and actions
- **Low-code tools** — Scripting/logic extensions
- **Webhooks** — External integration points
- **Templates** — Pre-built app templates

### 3.2 Navigation & Organization

- **Recent & Favorites** — Quick access to frequently used items
- **Tools** — Extension tools within apps
- **Docs** — Internal documentation
- **Chat** — Built-in communication
- **Agents** — AI agent configuration

### 3.3 Agent Builder (SoloAI)

- Custom AI agents that operate on table data
- Configured per app/table context
- Chat interface for interaction
- WhatsApp integration

### 3.4 What Sales Engine Can Learn

> **Current Sales Engine state:** Custom tables exist but there's no "app" abstraction layer.

**Implementation opportunities:**
1. **App container** — Group tables, forms, kanbans, and automations into an "App" with its own navigation
2. **Multi-view per table** — Each table should support Table Grid, Kanban, Form, and Calendar views
3. **Template system** — Pre-built app templates (CRM, Project Management, Inventory)
4. **Per-app permissions** — Users get access to entire apps, not individual tables

---

## 4. UI / UX Patterns

### 4.1 Navigation Structure

```
Home
├── Inbox (Notifications)
├── Chat
├── Tasks
├── Docs
├── Agents (SoloAI)
├── WhatsApp
├── Settings
├── Uploads
├── Templates
└── Apps (Builder)
    ├── Tables
    ├── Kanbans
    ├── Forms
    ├── Automation
    └── Webhooks
```

### 4.2 Table View Features

- **Search** — Global search across fields and tools ("Search fields and tools")
- **Filter, Sort, Group** — Data manipulation
- **Drag & Drop** — Reorder rows, rearrange columns
- **Inline Edit** — Edit directly in table cells
- **Bulk Actions** — Batch update, delete, export
- **Row Actions** — Open, Edit, Clone, Copy, Delete, Duplicate
- **Right-click context menus**

### 4.3 Record View Features

- **Comments / Messages** — Per-record discussion thread
- **Activity History** — Change log per record
- **Attachments** — File uploads per record
- **Timeline** — Time-based record events

### 4.4 Field-Level Interactions

- **Favorite toggle** — Star records for quick access
- **Status tracking** — Status field with stage progression
- **Goal / Indicator** — Progress tracking fields
- **Checklist / To-dos** — Per-record task lists

### 4.5 What Sales Engine Can Learn

**Implementation opportunities:**
1. **Record activity feed** — History of changes, comments, and file attachments per record
2. **Inline editing** — Click-to-edit in table cells without opening a modal
3. **Record cloning** — "Duplicate row" as a single-click action
4. **Drag-and-drop reordering** — Both rows and kanban stages
5. **Bulk operations** — Select multiple rows → batch edit / delete / export
6. **Right-click context menu** — Fast actions on records

---

## 5. Field Type System

### 5.1 Complete Field Inventory

| Category | Fields |
|----------|--------|
| **Text** | Text, Email, Phone, Link, Address, Car Plate Number, CNPJ, CPF |
| **Numeric** | Number, Currency, Percentage |
| **Selection** | Single Option, Multiple Selection, Tags, Select, Radio, Checkbox, Switch |
| **Date/Time** | Date, Date Range, Time, Timer (duration) |
| **User** | User (single), Multiple Users, Record Attribution |
| **Relations** | Connected Records (N:1), Lookup, Roll-Up, Database Connection |
| **Media** | Attachment, Files, Image, Signature |
| **Productivity** | Checklist, To-dos, Goal, Indicator |
| **Automation** | Automation Button, Button, Link Button, Message Button |
| **AI** | Vision (image recognition), Artificial Intelligence field |
| **Formula** | Formulas (spreadsheet-like calculations with connected data) |
| **Formatting** | Text Formatting, Number Formatting |

### 5.2 Brazil-Specific Fields

- **CNPJ** — Brazilian corporate tax ID (14 digits)
- **CPF** — Brazilian individual tax ID (11 digits)
- **Address** — Structured Brazilian address
- **Car Plate** — Brazilian license plate (old and Mercosul formats)
- **Phone** — Brazilian phone format (+55)

### 5.3 What Sales Engine Can Learn

> **Current Sales Engine state:** Basic field types exist (text, number, boolean, select, date, json).

**Implementation priorities:**
1. **Currency field** — With symbol configuration (R$, USD, €)
2. **User/Multiple Users** — Link records to workspace users
3. **Checklist** — Sub-items within a record
4. **Formula fields** — Derived/computed values from other fields
5. **Rating/Goal** — Visual progress indicators
6. **Signature** — Capture drawn signatures (useful for approvals)

---

## 6. Automation & Business Logic

### 6.1 Automation Capabilities

- **Automation Rules** — 158 references to "rule" in the codebase
- **Triggers** — Record created, updated, deleted, status changed
- **Actions** — Send email, webhook, update record, create record, notify user
- **Automation Button** — Field-level button that triggers a workflow
- **Webhooks** — Outbound HTTP calls to external systems
- **Schedule / Cron** — Time-based automation triggers

### 6.2 AI Integration

- **SoloAI** — Dedicated AI agent accessible via chat
- **Vision** — AI-powered image recognition on attachments
- **Artificial Intelligence** — AI field type for classification/prediction
- **Chat** — Conversational interface for querying data

### 6.3 What Sales Engine Can Learn

> **Current Sales Engine state:** Webhook configurations exist, but no automation rules engine.

**Implementation opportunities:**
1. **Trigger-Action rules** — When record is created/updated → perform action
2. **Field-level automation buttons** — Custom buttons that execute a workflow
3. **Scheduled automations** — Run rules on a timer (daily reports, cleanup)
4. **Approval workflows** — Multi-step approval chains on status changes

---

## 7. Vertical / Domain Usage (Solar Energy CRM)

The sample data reveals Jestor being used for a **Solar Energy sales pipeline**:

### 7.1 Tables / Entities

| Table | Fields |
|-------|--------|
| **Oportunidade** (Opportunity) | Título, Cliente, CPF/CNPJ, Endereço, Instalação, Concessionária, Consultor, Email, Telefone |
| **Propostas Comerciais** (Proposals) | Fabricante, Módulo, Potência, Nº Módulos, Inversor (kW), Qtde Inversores, Tipo Estrutura, Monitoramento, Preço Total, Sistema (R$), Condições Pagamento, Equipamentos Extras, Consumo Médio Mensal, Exclusões, Adicionais, Status, Link Formulário |
| **Pipeline** | Stage-by-stage deal tracking |
| **Cadastro de Leads** | Lead registration |
| **Products** | Fabricantes: Canadian Solar, RenePV, Leapton, Auxsol, Solplanet, Maxeon, Deye, Hoymilles |

### 7.2 Business Logic Revealed

- **Pipeline stages** — Visual kanban for deal progression
- **Status tracking** — "Status Proposta" field
- **Pricing fields** — Currency, percentage, units (kW)
- **Lookup relationships** — Products linked to proposals
- **PDF generation** — "Link Formulário" suggests generated proposal PDFs

### 7.3 What Sales Engine Can Learn

**Implementation opportunities:**
1. **Pipeline / Deal stages** — Kanban view with configurable stages and stage-probability fields
2. **Product catalog** — A Products table that proposals reference
3. **Quote generation** — Generate PDF quotes from proposal data
4. **Commission / Pricing rules** — Formula fields for auto-calculating totals

---

## 8. Management & Governance

### 8.1 Admin Features

- **Users** — User management
- **Roles** — Role-based access control
- **History** — Audit log / activity log
- **Usage** — API usage and storage metrics
- **Settings** — Workspace configuration
- **Plan** — Subscription/billing plan management

### 8.2 Collaboration

- **Chat** — Built-in team messaging
- **Comments** — Per-record discussions
- **Mentions** — @-mention users in comments
- **Notifications** — Inbox for alerts and activity

### 8.3 What Sales Engine Can Learn

**Implementation opportunities:**
1. **Role-based permissions** — Viewer, Editor, Admin per table or per app
2. **Audit log** — Track all record changes with user attribution
3. **Record-level comments** — Threaded discussions tied to individual records
4. **In-app notifications** — Inbox for mentions, assignments, and changes

---

## 9. Summary: Feature Gap Analysis for Sales Engine

### High-Impact, Lower-Complexity (Quick Wins)

| Feature | Current SE State | Jestor Benchmark |
|---------|-----------------|------------------|
| Currency / Percentage fields | Missing | Native field types |
| Record cloning (duplicate) | Missing | Built-in |
| Multi-user field | Missing | Supported |
| Record-level comments | Missing | Built-in |
| User attribution fields | Missing | Native field type |
| Bulk actions (edit/delete) | Missing | Built-in |
| Kanban view | Missing | Standard view |

### Medium Complexity

| Feature | Current SE State | Jestor Benchmark |
|---------|-----------------|------------------|
| **Connected Records (N:1)** | **Custom tables exist but no relation** | Core feature |
| Lookup fields | Missing | Built on relations |
| Roll-up fields | Missing | Built on relations |
| Formula fields | Missing | Spreadsheet-like |
| Checklist / To-dos | Missing | Native field type |
| Favorites system | Missing | Global feature |
| Per-record activity history | Missing | Built-in |
| Right-click context menus | Missing | Standard UX |
| App-level views (Kanban/Calendar/Form) | Table only | Multiple view types |

### High Complexity

| Feature | Current SE State | Jestor Benchmark |
|---------|-----------------|------------------|
| **N:M Bidirectional relations** | **None** | Full support |
| **Apps Builder** | **No app abstraction** | Core product |
| Automation rules engine | None | Fully built |
| Scheduled automations | None | Supported |
| AI fields / Vision | None | Integrated |
| Custom AI agents | None | SoloAI feature |
| Approval workflows | None | Rule-based |
| Digital signatures | None | Native field |
| Audit log | Basic | Comprehensive |
| Role-based access per table/app | Basic | Granular |

---

## 10. Key Architectural Insights

### 10.1 Technology Stack (Inferred)

- **Frontend:** Vue.js (Vite bundler, component-based)
- **State Management:** Pinia (Vuex-like store patterns observed)
- **Styling:** CSS modules with hashed class names
- **Hosting:** CDN-delivered SPA
- **Real-time:** Likely WebSocket-based (Chat, Inbox features)

### 10.2 Data Model Architecture

```
App
├── Tables
│   ├── Fields (typed: text, number, relation, etc.)
│   ├── Views (Table, Kanban, Form, Calendar)
│   └── Records (individual data rows)
├── Automations (trigger → action rules)
├── Forms (custom data entry layouts)
└── Agents (AI configurations)
```

### 10.3 Relational Architecture

```
Table A ──Connected Records (N:1)──→ Table B
Table A ←──Lookup──────────────────── Table B (read field from B)
Table A ←──Roll-Up─────────────────── Table B (aggregate from B)
Table A ──Bidirectional Connection──→ Table B (N:M with junction)
```

---

## 11. Recommendations for Sales Engine Roadmap

### Phase 1 (Foundational)
1. **Connected Records (N:1)** — Link field between tables
2. **Lookup fields** — Mirror values from linked records
3. **Kanban view** — Visual pipeline for any table

### Phase 2 (Productivity)
4. **Record comments & activity feed**
5. **Record cloning (duplicate)**
6. **Formula fields** — Computed values
7. **Currency, Percentage, User field types**

### Phase 3 (Advanced)
8. **N:M bidirectional relations**
9. **Roll-up fields** — Aggregate over related records
10. **Automation rules engine** — Trigger → Action
11. **Calendar / Timeline views**

### Phase 4 (Platform)
12. **Apps abstraction** — Group tables into business apps
13. **App templates** — Pre-built solutions
14. **AI agent integration** — Natural language query over data
15. **Approval workflows**
