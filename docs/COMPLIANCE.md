# Applicable compliance (matrix — for legal review)

This matrix lists what **may** apply and what the software already supports. It is not legal advice and does not claim compliance with any law. The requirements must be confirmed from current official sources by qualified counsel at the time of launch, for every country where the service is offered, hosted or where users reside.

## Assumptions to confirm

| Dimension | Assumption |
|---|---|
| Market | Iraq first (Federal Iraq + Kurdistan Region), IQD, Arabic/English |
| Hosting | Not decided — single Linux VPS; location affects which laws apply |
| Users | Consumers (vehicle owners), businesses (merchants, workshops), staff (reviewers, moderators, admins) |
| Data | Contact data, vehicle identifiers (VIN), addresses/phones, technical vehicle data, repair histories; no payment card data; no special-category data intended |
| Payments | Cash on delivery; online gateway in test mode only |
| Content | Licensed third-party automotive data (none contracted yet) |

## Matrix

| Area | Possibly applicable (to verify) | Why it might apply | What the system already supports | Open items |
|---|---|---|---|---|
| Data protection — Iraq | Iraqi constitutional privacy provisions; any data-protection / cybercrime / e-transactions legislation in force at launch; KRG regulations for Kurdistan users | Personal data of Iraqi residents | Minimisation, encryption, access control, export/deletion, consent records, audit | Counsel to confirm current statutes and any registration/localisation duties |
| Data protection — hosting country | e.g. GDPR if hosted in the EU or targeting EU residents; other national laws | Location of servers / users | Same controls; DPIA-ready inventory (`PRIVACY_AND_CONSENT.md`) | Decide hosting; do not assume GDPR applies or does not |
| E-commerce & consumer protection | Iraqi commercial/consumer rules; returns and warranties; price display | Marketplace between merchants and consumers | Merchant terms & returns draft, per-sub-order returns, prices in IQD incl. delivery fees, seller identity shown | Counsel to review merchant agreement, platform liability, invoices |
| Payments | PCI DSS (only if card data is handled) | Future online gateway | No card data stored or processed; gateway adapter is test-only; webhook signature verification | Choose a PCI-compliant gateway; keep card entry on the gateway's hosted page |
| Advertising | Disclosure of paid placements | Sponsored products | `sponsored` flag always labelled; not mixed into technical recommendations | Policy text |
| Automotive safety advice | Liability for repair guidance | Diagnostic guidance | Disclaimers, safety rules, no generated procedures for safety systems, drafts labelled | Product liability review; technician sign-off on knowledge base |
| Licensed data | Provider contracts (Autodata, TecAlliance, CarsXE …) | Display, caching, translation, RAG, training rights | Licence policy model with default-deny permissions, expiry, disable | Contracts |
| AI | Transparency about automated assistance; any AI-specific rules in hosting/target jurisdictions | Local LLM explanations | Clear labelling of model text, sources, model/prompt/rules versions stored, no automated decisions with legal effect, human review for learning | Monitor regulation |
| Employment/staff access | Internal access policies | Admin & reviewer roles | RBAC, MFA, audit log | Internal policy |
| Telecom/e-mail | Anti-spam rules for future e-mail/SMS | Notifications | In-app only; e-mail/SMS not configured | Consent for marketing messages if ever added |

## Documents prepared as drafts

- Privacy policy, terms of use, learning consent, merchant & returns policy (in-app, `/legal/*`)
- Retention schedule (`PRIVACY_AND_CONSENT.md`)
- Security overview & risk register (`SECURITY.md`)
