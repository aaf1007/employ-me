# employ-me

An assistant that fills in job applications from your own information and keeps a record of what you applied to. You always review the form and submit it yourself.

## Language

### Employers' side

**ATS**:
The employer's applicant tracking system, which hosts the application form (e.g. Greenhouse, Lever, Ashby, Workday).
_Avoid_: job site, portal, platform

**Posting**:
One job opening as published on an ATS, identified by its ATS, employer and job id.
_Avoid_: job, listing, req, opening

**Application Form**:
The form an ATS shows for applying to a Posting, possibly split across several steps.
_Avoid_: application (that word means the record), page

**Attestation**:
A statement on an Application Form that you must affirm yourself, such as certifying it's true, giving consent, acknowledging an AI-use policy, or signing.
_Avoid_: checkbox, consent box

### Your side

**Profile**:
The facts about you that Application Forms ask for: identity, contact details, links, work authorization, work history, education, skills, preferences and salary expectations.
_Avoid_: account, user data, resume

**Work Authorization**:
Your answers about working in one particular country: whether you're allowed to work there, and whether you need sponsorship now or later. Your Profile holds a separate Work Authorization for each country you apply in.
_Avoid_: visa status, eligibility, citizenship

**Resume**:
A resume file you have added. You can keep several and choose one for each Application.
_Avoid_: CV

**Saved Answer**:
An answer you accepted for a question, kept so it can be reused on later Application Forms. You can override it for a specific employer.
_Avoid_: Q&A bank entry, snippet, template

**Self-ID Answer**:
Your answer to a voluntary self-identification question (gender, race/ethnicity, veteran status, disability), set by you for each question type.
_Avoid_: EEO data, demographics

### Filling

**Provider**:
The AI subscription you bring, either Claude or Codex.
_Avoid_: model, LLM, backend

**Fill**:
One pass of the assistant over the Application Form you have open. You always start it yourself, and it carries on through each later step as you move to it. It ends with every field marked filled, needs your review, or couldn't fill.
_Avoid_: autofill run, apply, auto-apply

**Draft**:
A free-text answer the Provider wrote for one question, which you haven't accepted yet. Once you accept it, edited or not, it becomes your answer and a Saved Answer.
_Avoid_: suggestion, generated answer

### Tracking

**Application**:
The record that you submitted an Application Form for a Posting. One is created only when the submission is confirmed, by the ATS's confirmation screen, by you saying yes to "did you apply?", or by you adding or importing it by hand. A form you abandon is not an Application.
_Avoid_: job, submission, entry

**Snapshot**:
The copy kept with an Application of what you sent: the Posting's description, the answers you submitted, and the Resume you used.
_Avoid_: archive, history

**Status**:
Where an Application stands: Applied, Interviewing, Offer, Rejected or Withdrawn. It starts at Applied, and only you change it.
_Avoid_: stage, state

**Tracker**:
Your list of Applications.
_Avoid_: dashboard, board, CRM
