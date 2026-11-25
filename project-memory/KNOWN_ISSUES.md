# Known Issues, Limitations and Risks

| ID | Type | Description | Status | Workaround / plan |
|---|---|---|---|---|
| KI-001 | Technical risk | Firebase under `file://` is unproven. Concerns to validate: (a) the modular Firebase SDK ships as ES modules, which browsers block from `file://`, so the classic-script "compat" builds would be needed; (b) Firebase Auth behaviour and API-key restrictions with a `null`/`file://` origin; (c) IndexedDB-based offline persistence varies by browser under `file://`; (d) Firestore network calls from a `null` origin. | Open | Phase 0 spike (TQ-1). If it fails, present alternatives before proceeding. |
| KI-002 | Security limitation | A `file://` app has no server; all code is visible to anyone with the folder. Security must rest on Firebase Auth + Firestore Security Rules, never on hidden pages or localStorage flags. | Accepted constraint | Design security rules as the real boundary. |
