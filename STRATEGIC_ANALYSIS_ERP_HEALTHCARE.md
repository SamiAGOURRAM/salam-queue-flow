# 🏥 Analyse Stratégique ERP Healthcare - Salam Queue Flow
## Vers l'Excellence du Secteur Santé Marocain

---

## 📊 EXECUTIVE SUMMARY

### Vision Actuelle
Vous développez une **plateforme CRM/ERP de gestion de files d'attente intelligente** pour le secteur de la santé au Maroc, avec l'ambition de créer une expérience "Uber-like" pour patients et professionnels de santé.

### État Actuel du Système (Analyse du Codebase)

#### ✅ Architecture Technique Solide
- **Stack Moderne**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions + Realtime)
- **Architecture**: Multi-tenant avec isolation par clinique
- **Sécurité**: Row Level Security (RLS) + RBAC (Role-Based Access Control)

#### ✅ Fonctionnalités Core Implémentées

**1. Gestion de File d'Attente Intelligente**
```
- Queue en temps réel avec positions dynamiques
- Check-in patient (présence/absence)
- Gestion des patients absents avec période de grâce (15 min)
- Retour tardif avec repositionnement automatique
- Skip queue pour urgences avec audit trail
- Recalcul automatique des temps d'attente
```

**2. Système de Notifications Multi-Canal**
```
- SMS via Twilio (implémenté)
- Templates multilingues (AR/FR/EN)
- Budget tracking (1000 SMS/mois par défaut)
- Coût estimé: 0.05 MAD/SMS
- Notifications: confirmation, position, tour, retard, absence
```

**3. Système de Prédiction de Temps d'Attente**
```
- Table appointment_metrics pour ML
- Prédiction basée sur:
  - Durée moyenne par type de consultation
  - Position dans la queue
  - Temps de consultation actuel
  - Historique du staff
  - Jour de la semaine
  - Heure de la journée
```

**4. Booking & Scheduling**
```
- Réservation en ligne par les patients
- Booking par réceptionniste
- Walk-in support
- Gestion de calendrier
- Types de rendez-vous multiples
- Disponibilité basée sur horaires clinique
```

**5. Gestion Multi-Rôles**
```
- Patients (guest ou enregistré)
- Clinic Owner
- Staff (médecins, infirmières, réceptionnistes)
- Super Admin
```

**6. Analytics & Audit**
```
- Queue snapshots (métriques horaires)
- Audit logs complets
- Patient clinic history
- Performance tracking
```

---

## 🌍 BENCHMARK: LEADERS MONDIAUX ERP HEALTHCARE

### 1. **Oracle Health (Cerner)**
**Ce qu'ils font bien:**
- **Interopérabilité**: Standards HL7, FHIR pour échange de données
- **Single Patient View**: Dossier patient unifié cross-établissements
- **Population Health Management**: Analytics au niveau population
- **Clinical Decision Support**: Alertes intelligentes basées sur guidelines cliniques
- **Revenue Cycle Management**: Facturation automatisée + codage ICD-10

**À adapter pour vous:**
```
✅ Implémenter FHIR pour compatibilité future avec systèmes nationaux
✅ Dossier patient unifié (historique multi-cliniques)
✅ Alertes cliniques (allergies, interactions médicamenteuses)
✅ Intégration facturation AMO/CNOPS (assurance maladie Maroc)
✅ Codage automatique des actes médicaux
```

### 2. **Epic Systems**
**Ce qu'ils font bien:**
- **MyChart Patient Portal**: Portail patient avec accès dossier, messagerie
- **Care Everywhere**: Partage de données entre établissements
- **Predictive Analytics**: ML pour prédire no-shows, réadmissions
- **Telehealth Integration**: Consultations virtuelles intégrées
- **Mobile-First**: Applications natives iOS/Android

**À adapter pour vous:**
```
✅ Patient Portal Marocain (accès historique médical, ordonnances)
✅ Prédiction no-shows avec ML (votre base existe déjà!)
✅ Téléconsultation (gros potentiel post-COVID au Maroc)
✅ App mobile native (React Native)
✅ Messagerie sécurisée patient-médecin
```

### 3. **Palantir Foundry for Healthcare**
**Ce qu'ils font bien:**
- **Data Integration**: Fusion de sources hétérogènes (labs, imaging, EHR)
- **Operational Intelligence**: Dashboards temps réel pour direction
- **Resource Optimization**: Allocation optimale lits, staff, équipements
- **Supply Chain**: Gestion stocks médicaments, consommables
- **COVID Response**: Tracking épidémies, allocation ressources

**À adapter pour vous:**
```
✅ Dashboard décisionnel pour directeurs cliniques
✅ Optimisation ressources (salles, staff) basée sur prédictions
✅ Gestion stocks (médicaments, équipements)
✅ Reporting épidémiologique (maladies saisonnières, vaccination)
✅ Intégration avec pharmacies pour ordonnances électroniques
```

### 4. **Veeva Systems (Life Sciences Cloud)**
**Ce qu'ils fait bien:**
- **Multichannel Marketing**: Campagnes patient education
- **Compliance Management**: GDPR, HIPAA
- **Clinical Trials Management**: Gestion essais cliniques
- **Patient Engagement**: Programmes de fidélisation

**À adapter pour vous:**
```
✅ Campagnes SMS préventives (rappels vaccins, dépistages)
✅ Compliance GDPR/Loi marocaine protection données
✅ Programme de fidélité patients (points, réductions)
✅ Education patient (contenus santé personnalisés)
```

### 5. **Doctolib (European Leader)**
**Ce qu'ils font bien:**
- **UX Exceptionnelle**: Booking en 3 clics
- **Slot Availability AI**: Optimisation créneaux libres
- **Reminder Automation**: Réduction 30% no-shows
- **Video Consultation**: Intégré nativement
- **Marketplace**: Annuaire médical avec avis patients

**À adapter pour vous:**
```
✅ UX ultra-simplifiée (vous êtes déjà bien parti!)
✅ AI pour optimiser créneaux (remplir trous planning)
✅ Système d'avis/ratings patients (votre code a déjà useFavorite/useRating!)
✅ Video consultation WebRTC
✅ Annuaire national médical Maroc
```

---

## 🎯 ROADMAP STRATÉGIQUE - 24 MOIS

### **PHASE 1: Consolidation & Excellence Opérationnelle (Mois 1-6)**

#### Sprint 1-2: Architecture Robuste
```typescript
// 1. Service Layer (Clean Architecture)
src/
  domain/
    entities/
      Patient.ts
      Appointment.ts
      Clinic.ts
    value-objects/
      WaitTime.ts
      QueuePosition.ts
    repositories/
      IPatientRepository.ts
  application/
    use-cases/
      BookAppointment.ts
      PredictWaitTime.ts
    services/
      NotificationService.ts
  infrastructure/
    persistence/
      SupabasePatientRepository.ts
    external/
      TwilioAdapter.ts
```

**Priorités:**
- ✅ Migrer vers Clean Architecture (Domain-Driven Design)
- ✅ Tests unitaires 80%+ coverage
- ✅ CI/CD Pipeline (GitHub Actions)
- ✅ Error tracking (Sentry)
- ✅ Performance monitoring (DataDog/New Relic)

#### Sprint 3-4: ML Wait Time Predictions
```python
# Modèle ML pour prédictions précises
features = [
    'appointment_type',
    'day_of_week',
    'time_slot',
    'is_first_visit',
    'queue_length',
    'staff_count',
    'average_service_time',
    'current_delay_minutes'
]

# Algorithmes à tester
- Random Forest (baseline)
- XGBoost (performance)
- LSTM (patterns temporels)
- Prophet (séries temporelles)
```

**Délivrables:**
- ✅ API ML predictions (Python FastAPI)
- ✅ Training pipeline automatique
- ✅ A/B testing prédictions
- ✅ Confidence scores affichés aux patients
- ✅ Continuous learning (réentraînement hebdomadaire)

#### Sprint 5-6: Patient Portal Avancé
```
Features:
- Historique médical complet
- Ordonnances électroniques (PDF sécurisés)
- Résultats d'analyses (intégration labs)
- Carnet de vaccination
- Rappels automatiques (vaccins, contrôles)
- Documents médicaux (imagerie, rapports)
- Messagerie sécurisée avec médecin
```

### **PHASE 2: Intelligence & Automation (Mois 7-12)**

#### Sprint 7-8: AI-Powered Scheduling
```
Fonctionnalités:
- Auto-suggest optimal slots (ML-based)
- Double-booking intelligent (buffer zones)
- Emergency slot reservation
- Overbooking calculé (comme airlines)
- Dynamic pricing (heures creuses vs pointe)
- Staff workload balancing
```

#### Sprint 9-10: Interopérabilité FHIR
```json
// Standard FHIR R4 Implementation
{
  "resourceType": "Patient",
  "identifier": [{
    "system": "https://salam-queue.ma/patient-id",
    "value": "12345"
  }],
  "name": [{
    "family": "AGOURAM",
    "given": ["Sami"]
  }],
  "telecom": [{
    "system": "phone",
    "value": "+212XXXXXXXXX",
    "use": "mobile"
  }]
}
```

**Objectifs:**
- ✅ API FHIR R4 complète
- ✅ Intégration Ministère Santé Maroc
- ✅ Partage données inter-cliniques (consentement patient)
- ✅ Import/Export dossiers médicaux
- ✅ Compatibilité CNOPS/AMO

#### Sprint 11-12: Téléconsultation Native
```
Stack Technique:
- WebRTC (Jitsi/Twilio Video)
- Screen sharing
- Document sharing
- E-prescription during call
- Automatic note-taking (AI transcription)
- Recording (consent-based)
- Integration planning post-call
```

### **PHASE 3: Ecosystem & Scale (Mois 13-18)**

#### Sprint 13-14: Marketplace & Network Effects
```
Modules:
1. Annuaire National
   - Recherche géolocalisée
   - Filtres (spécialité, langue, prix)
   - Avis/ratings patients
   - Photos cabinet, équipe
   - Certifications/diplômes

2. Pharmacy Integration
   - Ordonnances électroniques
   - Disponibilité médicaments
   - Livraison à domicile
   - Historique achats

3. Lab Integration
   - Booking analyses
   - Résultats automatiques
   - Alertes valeurs anormales

4. Imaging Centers
   - Réservation scanner/IRM/radio
   - Partage images DICOM
   - Rapports radiologiques
```

#### Sprint 15-16: Enterprise Features
```
Pour Grands Groupes Hospitaliers:
- Multi-site management
- Centralized reporting
- Group billing
- Staff rostering (planning équipes)
- Inventory management (stocks centralisés)
- Procurement (achats groupés)
- Fleet management (ambulances)
- Bed management (gestion lits)
```

#### Sprint 17-18: Mobile Apps (React Native)
```
Apps:
1. Patient App
   - Booking
   - Queue tracking
   - Dossier médical
   - Téléconsultation
   - Ordonnances
   - Paiements

2. Doctor App
   - Agenda
   - Patient files
   - Prescriptions
   - Notes vocales
   - Stats performance

3. Receptionist App
   - Check-in rapide
   - Queue management
   - Walk-in booking
   - Payments
```

### **PHASE 4: AI & Advanced Analytics (Mois 19-24)**

#### Sprint 19-20: Clinical Decision Support
```
AI Features:
- Drug interaction checking
- Allergy alerts
- Diagnosis suggestions (IBM Watson Health style)
- Treatment recommendations (guidelines)
- Cost-effective alternatives
- Generic drug suggestions
```

#### Sprint 21-22: Population Health Management
```
Analytics:
- Disease prevalence tracking
- Vaccination coverage maps
- Chronic disease management
- Risk stratification
- Preventive care campaigns
- Public health reporting
```

#### Sprint 23-24: Business Intelligence Suite
```
Dashboards:
1. Financial
   - Revenue trends
   - AR/AP
   - Payor mix
   - Fee collection rates

2. Operational
   - Patient flow
   - Staff productivity
   - Room utilization
   - Wait times trends

3. Clinical
   - Outcome measures
   - Readmission rates
   - Patient satisfaction
   - Quality metrics (HEDIS)
```

---

## 🏗️ ARCHITECTURE RECOMMANDÉE

### Microservices Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway (Kong)                   │
│                  Load Balancer (NGINX)                   │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Patient    │   │   Booking    │   │    Queue     │
│   Service    │   │   Service    │   │   Service    │
└──────────────┘   └──────────────┘   └──────────────┘
        │                  │                  │
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│Notification  │   │   Billing    │   │  Analytics   │
│   Service    │   │   Service    │   │   Service    │
└──────────────┘   └──────────────┘   └──────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
        ┌────────────────────────────────────┐
        │     Event Bus (Kafka/RabbitMQ)     │
        └────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │   │ Elasticsearch│
│  (Primary)   │   │   (Cache)    │   │   (Search)   │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Tech Stack Recommandé

```yaml
Frontend:
  Web: React 18 + TypeScript + Vite
  Mobile: React Native + Expo
  State: Zustand / Redux Toolkit
  UI: Tailwind + shadcn/ui (✅ vous avez déjà!)
  
Backend:
  API: Node.js + NestJS (ou) Python + FastAPI
  Database: PostgreSQL 15+ (Supabase ou self-hosted)
  Cache: Redis
  Search: Elasticsearch / Meilisearch
  
Real-time:
  WebSockets: Socket.io / Supabase Realtime
  Pub/Sub: Redis / RabbitMQ / Kafka
  
ML/AI:
  Python: TensorFlow / PyTorch / Scikit-learn
  Serving: TensorFlow Serving / Seldon
  MLOps: MLflow / Weights & Biases
  
Infrastructure:
  Cloud: AWS / GCP / Azure
  Container: Docker + Kubernetes
  CI/CD: GitHub Actions / GitLab CI
  Monitoring: DataDog / New Relic / Grafana
  
Security:
  Auth: OAuth 2.0 + JWT (Supabase Auth ✅)
  Encryption: AES-256, TLS 1.3
  Compliance: GDPR, HIPAA-ready
```

---

## 📈 BUSINESS MODEL & MONETIZATION

### Modèle Freemium SaaS

```
🆓 FREE TIER (Acquisition)
- 1 praticien
- 50 patients/mois
- SMS basic (100/mois)
- Support communautaire

💼 PROFESSIONAL (499 MAD/mois)
- 3 praticiens
- 500 patients/mois
- SMS 1000/mois
- Téléconsultation
- Analytics basiques
- Support email

🏢 CLINIC (1,499 MAD/mois)
- 10 praticiens
- Patients illimités
- SMS 5000/mois
- Téléconsultation illimitée
- Analytics avancées
- FHIR API
- Support prioritaire
- Multi-site

🏥 ENTERPRISE (Custom)
- Praticiens illimités
- Multi-sites
- SMS personnalisé
- BI Suite
- White-label
- SLA 99.9%
- Dedicated account manager
- On-premise option
```

### Revenus Complémentaires

```
1. Marketplace Commissions
   - 3% sur paiements patients
   - 5% sur ordonnances pharmacie
   - 10% sur analyses lab

2. Add-ons
   - Téléconsultation: +200 MAD/mois
   - BI Dashboard: +300 MAD/mois
   - WhatsApp Business API: +150 MAD/mois
   - Mobile App white-label: +500 MAD/mois

3. Services
   - Implementation: 5,000 - 50,000 MAD
   - Training: 2,000 MAD/jour
   - Custom development: 800 MAD/heure
   - Data migration: 10,000 MAD+
```

### Projections 3 ans (Maroc)

```
Year 1: 
- Clinics: 100
- MRR: 100K MAD
- ARR: 1.2M MAD

Year 2:
- Clinics: 500
- MRR: 600K MAD
- ARR: 7.2M MAD

Year 3:
- Clinics: 2000
- MRR: 3M MAD
- ARR: 36M MAD
```

---

## 🎯 QUICK WINS - PROCHAINS 90 JOURS

### Mois 1: Foundation

**Semaine 1-2: Code Quality**
```bash
# Setup essentials
npm install --save-dev jest @testing-library/react vitest
npm install --save-dev eslint-plugin-security
npm install --save-dev prettier eslint-config-prettier
npm install --save @sentry/react @sentry/node

# Add pre-commit hooks
npm install --save-dev husky lint-staged
```

**Semaine 3-4: ML Baseline**
```python
# Train simple wait time model
from sklearn.ensemble import RandomForestRegressor

features = df[['queue_position', 'appointment_type_encoded', 
               'day_of_week', 'hour', 'avg_service_time']]
target = df['actual_wait_time']

model = RandomForestRegressor(n_estimators=100)
model.fit(X_train, y_train)

# Deploy as API endpoint
# POST /api/predict-wait-time
```

### Mois 2: Patient Experience

**Features:**
- ✅ Patient Portal (historique, documents)
- ✅ Ratings & Reviews system
- ✅ Loyalty program basique
- ✅ SMS reminders J-1 (réduire no-shows)
- ✅ WhatsApp notifications (alternative SMS)

### Mois 3: Clinic Tools

**Features:**
- ✅ Advanced analytics dashboard
- ✅ Staff performance reports
- ✅ Revenue tracking
- ✅ Inventory management basique
- ✅ Export data (Excel/PDF)

---

## 🛡️ COMPLIANCE & SÉCURITÉ

### GDPR / Loi Marocaine 09-08

```
Implémentations requises:
✅ Consentement explicite collecte données
✅ Droit accès/rectification/suppression
✅ Portabilité données (export JSON/PDF)
✅ Pseudonymisation données analytics
✅ Encryption at rest (AES-256)
✅ Encryption in transit (TLS 1.3)
✅ Audit logs 2 ans minimum
✅ Data retention policies
✅ Breach notification (72h CNDP)
✅ Privacy by design
```

### Security Checklist

```
[x] Row Level Security (RLS) - DONE
[x] JWT token auth - DONE
[ ] 2FA authentication
[ ] Rate limiting API
[ ] DDoS protection (Cloudflare)
[ ] SQL injection prevention
[ ] XSS protection
[ ] CSRF tokens
[ ] Penetration testing (annuel)
[ ] Security audits (trimestriel)
[ ] SOC 2 Type II (année 2)
[ ] ISO 27001 (année 3)
```

---

## 📚 STANDARDS & BEST PRACTICES

### Code Standards

```typescript
// 1. Use TypeScript strict mode
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}

// 2. Domain-Driven Design
class Appointment {
  constructor(
    private id: AppointmentId,
    private patient: Patient,
    private slot: TimeSlot,
    private status: AppointmentStatus
  ) {}

  book(): void {
    if (!this.slot.isAvailable()) {
      throw new SlotNotAvailableError();
    }
    this.status = AppointmentStatus.BOOKED;
    // Emit domain event
    DomainEvents.raise(new AppointmentBookedEvent(this));
  }
}

// 3. SOLID Principles
// Single Responsibility
class WaitTimePredictor {
  predict(appointment: Appointment): WaitTime {
    // Only prediction logic
  }
}

// 4. Error Handling
try {
  await appointmentService.book(params);
} catch (error) {
  if (error instanceof SlotNotAvailableError) {
    toast.error('Créneau indisponible');
  } else if (error instanceof PaymentFailedError) {
    toast.error('Paiement échoué');
  } else {
    logger.error(error);
    toast.error('Erreur inattendue');
  }
}
```

### API Design (RESTful)

```
GET    /api/v1/clinics                    # List clinics
GET    /api/v1/clinics/:id                # Get clinic
POST   /api/v1/clinics                    # Create clinic
PATCH  /api/v1/clinics/:id                # Update clinic
DELETE /api/v1/clinics/:id                # Delete clinic

GET    /api/v1/appointments                # List appointments
GET    /api/v1/appointments/:id            # Get appointment
POST   /api/v1/appointments                # Book appointment
PATCH  /api/v1/appointments/:id            # Update appointment
DELETE /api/v1/appointments/:id            # Cancel appointment

POST   /api/v1/queue/check-in              # Check-in patient
POST   /api/v1/queue/mark-absent           # Mark absent
POST   /api/v1/queue/call-next             # Call next patient
GET    /api/v1/queue/predictions/:id       # Get wait time prediction

# Versioning
Accept: application/vnd.salamqueue.v1+json
```

---

## 🚀 DIFFÉRENCIATEURS COMPÉTITIFS

### Ce qui vous rend unique au Maroc:

1. **Prix Marocain** (vs solutions internationales)
   - 10x moins cher que Doctolib
   - Adapté économie locale
   - Support darija/français/arabe

2. **Contexte Local**
   - Intégration AMO/CNOPS
   - Données bancaires marocaines
   - Conformité CNDP (GDPR marocain)

3. **Innovation AI**
   - Prédictions ML wait times
   - Optimisation scheduling
   - Pattern detection no-shows

4. **Expérience Patient**
   - Pas besoin app (SMS/WhatsApp)
   - Interface ultra-simple
   - Temps réel véritable

5. **Extensibilité**
   - FHIR ready
   - API-first
   - Marketplace intégrations

---

## 📊 MÉTRIQUES DE SUCCÈS (KPIs)

### Product Metrics
```
- Daily Active Clinics (DAC)
- Monthly Booked Appointments
- Average Wait Time Reduction (%)
- No-Show Rate (target <10%)
- Patient Satisfaction Score (NPS)
- Prediction Accuracy (MAPE <15%)
```

### Business Metrics
```
- MRR (Monthly Recurring Revenue)
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)
- Churn Rate (target <5%/month)
- Net Revenue Retention (target >110%)
```

### Technical Metrics
```
- API Response Time (P95 <200ms)
- Uptime (target 99.9%)
- Error Rate (<0.1%)
- Test Coverage (>80%)
- Code Quality (SonarQube A rating)
```

---

## 🎓 RESOURCES & LEARNING

### Standards à étudier:
- HL7 FHIR R4 (healthcare data exchange)
- ICD-10 (disease classification)
- SNOMED CT (clinical terminology)
- DICOM (medical imaging)
- LOINC (lab observations)

### Books:
- "Domain-Driven Design" - Eric Evans
- "Clean Architecture" - Robert Martin
- "Designing Data-Intensive Applications" - Martin Kleppmann
- "Healthcare Information Systems" - Joseph Tan

### Courses:
- Fast.ai (ML for healthcare)
- AWS Healthcare Accelerator
- Google Cloud Healthcare API
- Coursera: AI in Healthcare

---

## 💡 CONCLUSION & NEXT STEPS

### Votre position est excellente! 🎉

**Points forts:**
✅ Architecture technique moderne et scalable
✅ Features core bien implémentées
✅ Vision claire et ambitieuse
✅ Contexte marocain (opportunité énorme)

**Axes d'amélioration prioritaires:**
1. **Tests** (coverage critique pour scaling)
2. **ML Predictions** (différenciateur clé)
3. **Mobile Apps** (indispensable)
4. **FHIR API** (interopérabilité future)
5. **Business Intelligence** (valeur cliniques)

### Plan d'action immédiat:

**Cette semaine:**
```bash
1. Setup testing (Jest + Vitest)
2. Add Sentry error tracking
3. Create ML training script (baseline)
4. Document API (Swagger/OpenAPI)
5. Setup CI/CD pipeline
```

**Ce mois:**
```bash
1. Migrate to Clean Architecture (core domain)
2. Train wait time prediction model
3. Deploy ML API endpoint
4. Build patient portal v1
5. Add ratings/reviews
```

**Ce trimestre:**
```bash
1. Launch mobile beta (React Native)
2. Implement téléconsultation
3. Add WhatsApp notifications
4. Build BI dashboard
5. Onboard 20 clinics beta
```

---

## 📞 SUPPORT TECHNIQUE

Pour toute question sur l'implémentation:

**Architecture:** Voir `/ARCHITECTURE_ANALYSIS.md` (déjà dans votre repo)
**Queue Service:** Voir `/src/services/queue/QueueService.ts`
**API Design:** Voir `/ARCHITECTURE_DIAGRAMS.md`

---

**🌟 Vous construisez le futur de la santé au Maroc. Let's make it happen! 🇲🇦**

---

*Document généré le: 25 Octobre 2025*  
*Version: 1.0*  
*Auteur: GitHub Copilot - Expert ERP Healthcare*
