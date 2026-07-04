🛠️ SPRINT 5.5: THE CHAT V1 CALIBRATION (Bug Fix & Flow) Product: SV01 · Sales
Engine CRM Target: Chat & CRM V1 (Friction Removal) Objective: Restore the
"McLaren" flow. Eliminate data fragmentation, reduce repetitive clicks, and
enable team scaling.

🌌 THE NORTH STAR A luxury system does not stutter, and it never duplicates its
thoughts. Right now, our engine has a massive data leak: the system is failing
to recognize returning users, causing extreme fragmentation in both the inbox
and the database. Furthermore, the operator is experiencing UI friction (wrong
default views, lack of bulk actions).

This sprint is purely about Cohesion and Control. The system must confidently
know who is speaking, present the data cleanly, allow ruthless bulk cleaning,
and finally, let the admin hand the keys to new team members.

🛑 EPIC 1: The Fragmentation Anomaly (Identity Resolution) The Problem:
Currently, for specific clients, the system has amnesia. Every single time the
client sends a WhatsApp message, the software treats it as a brand new
interaction. It opens a completely new chat session in the Inbox and creates a
duplicate Contact in the CRM. This destroys the timeline and floods the database
with trash.

The Vision (Singular Identity): The system must be telepathic. When a message
arrives, the system must definitively identify the phone number. If that person
exists, the message silently glides into their existing chat history, and their
existing CRM profile is updated. One human = One Contact = One unified
conversation thread. Absolute cohesion.

👁️ EPIC 2: The Omniscient Default (Inbox View) The Problem: When a manager logs
into the Chat, the system defaults to "Meus Chats" (My Chats). For an
administrator or a business owner looking to read the pulse of their operation,
this is a blindfold. They have to manually click to see the whole board.

The Vision (Immediate Pulse): When the operator opens the inbox, they are
greeted by "Todos os Chats" (All Chats) by default. Zero clicks required to see
the macro vision of the company's communications. The engine presents the full
reality instantly.

🧹 EPIC 3: Ruthless Efficiency (Bulk Actions) The Problem: Because of the
fragmentation bug (or simply due to daily spam), operators are left with an
inbox full of noise. Currently, cleaning this noise requires opening or
interacting with items one by one. This is manual grind, which we fundamentally
oppose.

The Vision (Mass Command): The UI must allow for a sweeping action. The operator
selects multiple conversations at once (checkboxes) and executes a single
command: Archive, Delete, or Mark as Read. The noise disappears instantly. Calm
is restored to the dashboard.

🔑 EPIC 4: Crew Onboarding (Admin Access) The Problem: The system is ready to
scale, but the door is locked. The administrator has no interface to invite new
sales representatives, assign them to a specific company/tenant (Equipe), and
define what they are allowed to touch (Roles).

The Vision (The Key Master): Inside the Admin/Settings panel, the business owner
has an elegant command center to add a human to the machine. Type an email,
select the tenant, select the role (Admin, User, AI Observer), and send. The
system orchestrates the permissions invisibly.

PM Note for the Software Engineer: This is the required outcome. Your job is to
analyze the Webhook pipelines, the Supabase matching logic, and the React state
to make this a reality. Do not proceed to any new AI features until this flow is
mathematically perfect.
