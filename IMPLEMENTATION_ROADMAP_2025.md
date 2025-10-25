# 🚀 Roadmap d'Implémentation Technique 2025-2026
## Salam Queue Flow - Healthcare ERP Platform

---

## 🎯 PHASE 1: FONDATIONS SOLIDES (Mois 1-3)

### Sprint 1: Architecture & Testing (Semaines 1-2)

#### Objectif: Code Quality & Reliability

**1. Setup Testing Infrastructure**

```bash
# Installation
npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/user-event
npm install --save-dev @testing-library/jest-dom msw
npm install --save-dev @vitest/coverage-v8

# Configuration vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
})
```

**2. Créer Tests pour Services Existants**

```typescript
// src/services/queue/__tests__/QueueService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../QueueService';
import { QueueRepository } from '../repositories/QueueRepository';

describe('QueueService', () => {
  let service: QueueService;
  let mockRepository: jest.Mocked<QueueRepository>;

  beforeEach(() => {
    mockRepository = {
      getQueueByDate: vi.fn(),
      createQueueEntry: vi.fn(),
      updateQueueEntry: vi.fn(),
    } as any;
    
    service = new QueueService(mockRepository);
  });

  describe('addToQueue', () => {
    it('should add patient to queue with auto-assigned position', async () => {
      const dto = {
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        staffId: 'staff-1',
        appointmentDate: new Date(),
        appointmentType: 'consultation',
      };

      const expectedEntry = {
        ...dto,
        id: 'apt-1',
        queuePosition: 5,
        status: 'scheduled'
      };

      mockRepository.createQueueEntry.mockResolvedValue(expectedEntry);

      const result = await service.addToQueue(dto);

      expect(result).toEqual(expectedEntry);
      expect(mockRepository.createQueueEntry).toHaveBeenCalledWith({
        ...dto,
        autoAssignPosition: true
      });
    });

    it('should throw error for past dates', async () => {
      const pastDate = new Date('2020-01-01');
      const dto = {
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        staffId: 'staff-1',
        appointmentDate: pastDate,
        appointmentType: 'consultation',
      };

      await expect(service.addToQueue(dto)).rejects.toThrow(
        'Cannot create appointments for past dates'
      );
    });
  });

  describe('getQueueSummary', () => {
    it('should calculate correct summary statistics', async () => {
      const mockQueue = [
        { status: 'waiting', skipReason: null },
        { status: 'waiting', skipReason: null },
        { status: 'in_progress' },
        { status: 'completed' },
        { status: 'waiting', skipReason: 'patient_absent', returnedAt: null },
      ];

      mockRepository.getQueueByDate.mockResolvedValue(mockQueue);

      const summary = await service.getQueueSummary('clinic-1', new Date());

      expect(summary).toMatchObject({
        totalAppointments: 5,
        waiting: 2,
        inProgress: 1,
        completed: 1,
        absent: 1,
      });
    });
  });
});
```

**Résultat attendu:** 80%+ test coverage sur services critiques

---

### Sprint 2: Clean Architecture Refactoring (Semaines 3-4)

#### Objectif: Separation of Concerns

**Structure de dossiers cible:**

```
src/
├── domain/
│   ├── entities/
│   │   ├── Patient.ts
│   │   ├── Appointment.ts
│   │   ├── Clinic.ts
│   │   └── Queue.ts
│   ├── value-objects/
│   │   ├── WaitTime.ts
│   │   ├── QueuePosition.ts
│   │   └── TimeSlot.ts
│   ├── repositories/
│   │   ├── IPatientRepository.ts
│   │   ├── IAppointmentRepository.ts
│   │   └── IClinicRepository.ts
│   └── events/
│       ├── DomainEvent.ts
│       └── AppointmentBooked.ts
├── application/
│   ├── use-cases/
│   │   ├── BookAppointment/
│   │   │   ├── BookAppointmentUseCase.ts
│   │   │   ├── BookAppointmentDTO.ts
│   │   │   └── BookAppointmentValidator.ts
│   │   ├── PredictWaitTime/
│   │   └── ManageQueue/
│   └── services/
│       ├── NotificationService.ts
│       └── PaymentService.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── SupabasePatientRepository.ts
│   │   └── SupabaseAppointmentRepository.ts
│   ├── external/
│   │   ├── TwilioNotificationAdapter.ts
│   │   └── StripePaymentAdapter.ts
│   └── ml/
│       └── WaitTimePredictionClient.ts
└── presentation/
    ├── components/
    ├── pages/
    └── hooks/
```

**Exemple: Domain Entity**

```typescript
// src/domain/entities/Appointment.ts
import { AppointmentStatus } from './AppointmentStatus';
import { WaitTime } from '../value-objects/WaitTime';
import { DomainEvents } from '../events/DomainEvent';
import { AppointmentBookedEvent } from '../events/AppointmentBooked';

export class Appointment {
  private constructor(
    public readonly id: string,
    public readonly patientId: string,
    public readonly clinicId: string,
    public readonly staffId: string,
    private status: AppointmentStatus,
    private queuePosition: number | null,
    private predictedWaitTime: WaitTime | null,
    private checkedInAt: Date | null
  ) {}

  static create(data: CreateAppointmentData): Appointment {
    const appointment = new Appointment(
      generateId(),
      data.patientId,
      data.clinicId,
      data.staffId,
      AppointmentStatus.SCHEDULED,
      null,
      null,
      null
    );

    DomainEvents.raise(new AppointmentBookedEvent(appointment));
    return appointment;
  }

  checkIn(): void {
    if (this.status !== AppointmentStatus.SCHEDULED) {
      throw new Error('Can only check in scheduled appointments');
    }
    this.status = AppointmentStatus.WAITING;
    this.checkedInAt = new Date();
  }

  updatePrediction(waitTime: WaitTime): void {
    this.predictedWaitTime = waitTime;
  }

  assignQueuePosition(position: number): void {
    if (position < 1) {
      throw new Error('Queue position must be positive');
    }
    this.queuePosition = position;
  }

  // Business logic encapsulated
  canBeCancelled(): boolean {
    return this.status !== AppointmentStatus.COMPLETED;
  }

  getStatus(): AppointmentStatus {
    return this.status;
  }
}
```

**Exemple: Use Case**

```typescript
// src/application/use-cases/BookAppointment/BookAppointmentUseCase.ts
import { IAppointmentRepository } from '@/domain/repositories/IAppointmentRepository';
import { INotificationService } from '@/application/services/INotificationService';
import { Appointment } from '@/domain/entities/Appointment';

export class BookAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private notificationService: INotificationService
  ) {}

  async execute(dto: BookAppointmentDTO): Promise<BookAppointmentResult> {
    // 1. Validate
    this.validate(dto);

    // 2. Check availability
    const isAvailable = await this.appointmentRepo.isSlotAvailable(
      dto.clinicId,
      dto.date,
      dto.time
    );
    if (!isAvailable) {
      throw new SlotNotAvailableError();
    }

    // 3. Create appointment (domain logic)
    const appointment = Appointment.create({
      patientId: dto.patientId,
      clinicId: dto.clinicId,
      staffId: dto.staffId,
      date: dto.date,
      time: dto.time,
      type: dto.appointmentType
    });

    // 4. Persist
    await this.appointmentRepo.save(appointment);

    // 5. Send notification
    await this.notificationService.sendBookingConfirmation(appointment);

    return {
      appointmentId: appointment.id,
      queuePosition: appointment.getQueuePosition(),
      estimatedWaitTime: appointment.getPredictedWaitTime()
    };
  }

  private validate(dto: BookAppointmentDTO): void {
    if (!dto.patientId) throw new Error('Patient ID required');
    if (!dto.clinicId) throw new Error('Clinic ID required');
    // ... more validation
  }
}
```

---

### Sprint 3: Machine Learning Foundation (Semaines 5-6)

#### Objectif: Production-Ready ML Pipeline

**1. Setup ML Service (Python FastAPI)**

```bash
# Créer nouveau service
mkdir ml-service
cd ml-service

# Structure
ml-service/
├── app/
│   ├── main.py
│   ├── models/
│   │   └── wait_time_predictor.py
│   ├── training/
│   │   ├── train.py
│   │   └── evaluate.py
│   └── api/
│       └── routes.py
├── requirements.txt
├── Dockerfile
└── tests/
```

**2. Training Pipeline**

```python
# ml-service/app/training/train.py
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib
from supabase import create_client
import os

class WaitTimePredictionModel:
    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=200,
            max_depth=15,
            min_samples_split=10,
            random_state=42
        )
        self.feature_columns = [
            'queue_position',
            'appointment_type_encoded',
            'day_of_week',
            'hour',
            'is_first_visit',
            'avg_service_time_clinic',
            'current_queue_length',
            'staff_count',
            'time_slot_encoded'
        ]

    def load_training_data(self):
        """Fetch historical data from Supabase"""
        supabase = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )
        
        # Query completed appointments with actual wait times
        result = supabase.table('appointments')\
            .select('*, clinic:clinics(*), patient_history:patient_clinic_history(*)')\
            .eq('status', 'completed')\
            .not_.is_('actual_start_time', 'null')\
            .not_.is_('checked_in_at', 'null')\
            .execute()
        
        df = pd.DataFrame(result.data)
        return self.prepare_features(df)

    def prepare_features(self, df):
        """Engineer features"""
        # Calculate actual wait time (target)
        df['actual_wait_time'] = (
            pd.to_datetime(df['actual_start_time']) - 
            pd.to_datetime(df['checked_in_at'])
        ).dt.total_seconds() / 60

        # Extract features
        df['hour'] = pd.to_datetime(df['scheduled_time']).dt.hour
        df['day_of_week'] = pd.to_datetime(df['appointment_date']).dt.dayofweek
        
        # Encode categorical
        df['appointment_type_encoded'] = pd.Categorical(df['appointment_type']).codes
        df['time_slot_encoded'] = pd.Categorical(df['time_slot']).codes
        
        # Aggregate clinic stats
        clinic_stats = df.groupby('clinic_id').agg({
            'actual_duration': 'mean',
            'staff_id': 'nunique'
        }).rename(columns={
            'actual_duration': 'avg_service_time_clinic',
            'staff_id': 'staff_count'
        })
        
        df = df.merge(clinic_stats, on='clinic_id', how='left')
        
        return df[self.feature_columns + ['actual_wait_time']]

    def train(self, X, y):
        """Train the model"""
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        self.model.fit(X_train, y_train)
        
        # Evaluate
        y_pred = self.model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        
        print(f"Model Performance:")
        print(f"MAE: {mae:.2f} minutes")
        print(f"RMSE: {rmse:.2f} minutes")
        
        # Feature importance
        feature_importance = pd.DataFrame({
            'feature': self.feature_columns,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        print("\nFeature Importance:")
        print(feature_importance)
        
        return {
            'mae': mae,
            'rmse': rmse,
            'feature_importance': feature_importance.to_dict()
        }

    def save(self, path='models/wait_time_model.pkl'):
        """Save trained model"""
        joblib.dump(self.model, path)
        print(f"Model saved to {path}")

    def load(self, path='models/wait_time_model.pkl'):
        """Load trained model"""
        self.model = joblib.load(path)
        print(f"Model loaded from {path}")

if __name__ == '__main__':
    # Train model
    model = WaitTimePredictionModel()
    df = model.load_training_data()
    
    X = df[model.feature_columns]
    y = df['actual_wait_time']
    
    metrics = model.train(X, y)
    model.save()
```

**3. Prediction API**

```python
# ml-service/app/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np
from typing import Optional

app = FastAPI(title="Wait Time Prediction API")

# Load model on startup
model = joblib.load('models/wait_time_model.pkl')

class PredictionRequest(BaseModel):
    queue_position: int
    appointment_type: str
    day_of_week: int
    hour: int
    is_first_visit: bool
    avg_service_time_clinic: float
    current_queue_length: int
    staff_count: int
    time_slot: str

class PredictionResponse(BaseModel):
    predicted_wait_time: float
    confidence_interval_low: float
    confidence_interval_high: float
    confidence_score: float

@app.post("/predict", response_model=PredictionResponse)
async def predict_wait_time(request: PredictionRequest):
    try:
        # Encode categorical features
        appointment_type_mapping = {
            'consultation': 0,
            'follow_up': 1,
            'procedure': 2,
            'emergency': 3
        }
        time_slot_mapping = {
            'morning': 0,
            'afternoon': 1,
            'evening': 2
        }
        
        features = np.array([[
            request.queue_position,
            appointment_type_mapping.get(request.appointment_type, 0),
            request.day_of_week,
            request.hour,
            int(request.is_first_visit),
            request.avg_service_time_clinic,
            request.current_queue_length,
            request.staff_count,
            time_slot_mapping.get(request.time_slot, 0)
        ]])
        
        # Predict
        prediction = model.predict(features)[0]
        
        # Estimate confidence (simplified)
        # In production, use prediction intervals from model
        std_dev = prediction * 0.15  # 15% uncertainty
        confidence = max(0.6, min(0.95, 1 - (std_dev / prediction)))
        
        return PredictionResponse(
            predicted_wait_time=round(prediction, 1),
            confidence_interval_low=round(prediction - std_dev, 1),
            confidence_interval_high=round(prediction + std_dev, 1),
            confidence_score=round(confidence, 2)
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": model is not None}
```

**4. Integration avec Frontend**

```typescript
// src/services/ml/WaitTimePredictionService.ts
export class WaitTimePredictionService {
  private apiUrl = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000';

  async predict(data: PredictionInput): Promise<PredictionResult> {
    try {
      const response = await fetch(`${this.apiUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queue_position: data.queuePosition,
          appointment_type: data.appointmentType,
          day_of_week: new Date(data.date).getDay(),
          hour: parseInt(data.time.split(':')[0]),
          is_first_visit: data.isFirstVisit,
          avg_service_time_clinic: data.clinicAvgServiceTime,
          current_queue_length: data.currentQueueLength,
          staff_count: data.staffCount,
          time_slot: this.getTimeSlot(data.time)
        })
      });

      if (!response.ok) {
        throw new Error('Prediction failed');
      }

      return await response.json();
    } catch (error) {
      logger.error('Wait time prediction failed', error);
      // Fallback to simple calculation
      return this.fallbackPrediction(data);
    }
  }

  private fallbackPrediction(data: PredictionInput): PredictionResult {
    // Simple formula as fallback
    const avgWait = data.queuePosition * data.clinicAvgServiceTime;
    return {
      predicted_wait_time: avgWait,
      confidence_interval_low: avgWait * 0.85,
      confidence_interval_high: avgWait * 1.15,
      confidence_score: 0.5
    };
  }

  private getTimeSlot(time: string): string {
    const hour = parseInt(time.split(':')[0]);
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}
```

---

## 🎯 PHASE 2: FEATURES AVANCÉES (Mois 4-6)

### Sprint 4: Patient Portal (Semaines 7-8)

**Features à implémenter:**

```typescript
// 1. Medical History
interface MedicalHistory {
  consultations: Consultation[];
  prescriptions: Prescription[];
  labResults: LabResult[];
  vaccinations: Vaccination[];
  allergies: Allergy[];
  chronicConditions: Condition[];
}

// 2. Document Management
interface MedicalDocument {
  id: string;
  type: 'prescription' | 'lab_result' | 'imaging' | 'report';
  title: string;
  date: Date;
  uploadedBy: string;
  fileUrl: string;
  encrypted: boolean;
}

// 3. Appointment History with Details
interface AppointmentHistory {
  id: string;
  clinicName: string;
  doctorName: string;
  date: Date;
  type: string;
  diagnosis?: string;
  prescriptions: Prescription[];
  followUpDate?: Date;
  notes: string;
}
```

**UI Components:**

```tsx
// src/components/patient/MedicalHistoryTimeline.tsx
export function MedicalHistoryTimeline({ patientId }: Props) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['medical-history', patientId],
    queryFn: () => fetchMedicalHistory(patientId)
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Medical History</h2>
      
      <div className="relative border-l-2 border-blue-200 pl-6 space-y-6">
        {history?.consultations.map((consultation) => (
          <div key={consultation.id} className="relative">
            {/* Timeline dot */}
            <div className="absolute -left-[29px] w-4 h-4 bg-blue-500 rounded-full" />
            
            <Card>
              <CardHeader>
                <div className="flex justify-between">
                  <CardTitle>{consultation.clinicName}</CardTitle>
                  <Badge>{format(consultation.date, 'MMM dd, yyyy')}</Badge>
                </div>
                <CardDescription>Dr. {consultation.doctorName}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-2">
                <p className="text-sm"><strong>Type:</strong> {consultation.type}</p>
                {consultation.diagnosis && (
                  <p className="text-sm"><strong>Diagnosis:</strong> {consultation.diagnosis}</p>
                )}
                
                {consultation.prescriptions.length > 0 && (
                  <div>
                    <p className="font-medium">Prescriptions:</p>
                    <ul className="list-disc list-inside">
                      {consultation.prescriptions.map(p => (
                        <li key={p.id} className="text-sm">{p.medication} - {p.dosage}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Sprint 5: Analytics Dashboard (Semaines 9-10)

**Dashboard Components:**

```tsx
// src/components/clinic/AnalyticsDashboard.tsx
import { Card } from '@/components/ui/card';
import { LineChart, BarChart, PieChart } from 'recharts';

export function AnalyticsDashboard({ clinicId }: Props) {
  const { data: metrics } = useQuery({
    queryKey: ['analytics', clinicId],
    queryFn: () => fetchClinicMetrics(clinicId)
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Patients"
          value={metrics?.totalPatients}
          change="+12%"
          trend="up"
        />
        <MetricCard
          title="Avg Wait Time"
          value={`${metrics?.avgWaitTime} min`}
          change="-8%"
          trend="down"
        />
        <MetricCard
          title="No-Show Rate"
          value={`${metrics?.noShowRate}%`}
          change="-3%"
          trend="down"
        />
        <MetricCard
          title="Revenue"
          value={`${metrics?.revenue} MAD`}
          change="+15%"
          trend="up"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Flow Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Flow (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={metrics?.dailyPatients} />
          </CardContent>
        </Card>

        {/* Appointment Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment Types</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart data={metrics?.appointmentTypes} />
          </CardContent>
        </Card>

        {/* Peak Hours Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Busiest Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatMap data={metrics?.peakHours} />
          </CardContent>
        </Card>

        {/* Staff Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Staff Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={metrics?.staffStats} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

### Sprint 6: WhatsApp Integration (Semaines 11-12)

**Setup WhatsApp Business API:**

```typescript
// src/infrastructure/external/WhatsAppAdapter.ts
import axios from 'axios';

export class WhatsAppNotificationAdapter {
  private apiUrl = 'https://graph.facebook.com/v17.0';
  private phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  async sendMessage(to: string, template: WhatsAppTemplate): Promise<void> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: this.formatPhoneNumber(to),
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            components: template.components
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('WhatsApp message sent', { messageId: response.data.messages[0].id });
    } catch (error) {
      logger.error('WhatsApp send failed', error);
      throw new ExternalServiceError('WhatsApp', 'Failed to send message', error);
    }
  }

  async sendAppointmentConfirmation(appointment: Appointment): Promise<void> {
    const template: WhatsAppTemplate = {
      name: 'appointment_confirmation',
      language: 'ar',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: appointment.patient.fullName },
            { type: 'text', text: appointment.clinic.name },
            { type: 'text', text: format(appointment.date, 'dd/MM/yyyy') },
            { type: 'text', text: appointment.scheduledTime }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: appointment.id }
          ]
        }
      ]
    };

    await this.sendMessage(appointment.patient.phoneNumber, template);
  }

  private formatPhoneNumber(phone: string): string {
    // Remove spaces, dashes, format to international
    return phone.replace(/[\s-]/g, '').replace(/^0/, '212');
  }
}
```

**WhatsApp Templates à créer dans Meta Business:**

```
1. appointment_confirmation (ar)
   مرحبا {{1}},
   تم تأكيد موعدك في {{2}}
   📅 التاريخ: {{3}}
   ⏰ الوقت: {{4}}
   [زر: عرض التفاصيل]

2. your_turn (ar)
   {{1}}, حان دورك! 🎉
   يرجى التوجه إلى {{2}}
   [زر: الإبلاغ عن الوصول]

3. position_update (ar)
   تحديث: أنت الآن في الموقع {{1}}
   الوقت المتوقع: {{2}} دقيقة
   [زر: تتبع الطابور]
```

---

## 🎯 PHASE 3: MOBILE & SCALE (Mois 7-9)

### Sprint 7-8: React Native Mobile App (Semaines 13-16)

**Setup:**

```bash
npx create-expo-app@latest salam-queue-mobile --template
cd salam-queue-mobile
npx expo install react-native-reanimated react-native-gesture-handler
npx expo install @react-navigation/native @react-navigation/stack
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
```

**Architecture:**

```
salam-queue-mobile/
├── src/
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   ├── PatientStack.tsx
│   │   └── ClinicStack.tsx
│   ├── screens/
│   │   ├── patient/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── QueueTrackingScreen.tsx
│   │   │   ├── BookingScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   └── clinic/
│   │       ├── DashboardScreen.tsx
│   │       └── QueueManagementScreen.tsx
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── utils/
├── app.json
└── package.json
```

**Core Features:**

```tsx
// src/screens/patient/QueueTrackingScreen.tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/services/supabase';

export function QueueTrackingScreen({ route }) {
  const { appointmentId } = route.params;
  const [queueInfo, setQueueInfo] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchQueueInfo();
    
    // Real-time subscription
    const subscription = supabase
      .channel(`appointment:${appointmentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'appointments',
        filter: `id=eq.${appointmentId}`
      }, (payload) => {
        setQueueInfo(payload.new);
      })
      .subscribe();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true
        })
      ])
    ).start();

    return () => {
      subscription.unsubscribe();
    };
  }, [appointmentId]);

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Queue Position */}
        <Animated.View 
          style={[
            styles.positionCircle,
            { transform: [{ scale: pulseAnim }] }
          ]}
        >
          <Text style={styles.positionNumber}>
            {queueInfo?.queue_position || '-'}
          </Text>
        </Animated.View>
        
        <Text style={styles.label}>Your Position in Queue</Text>

        {/* Wait Time */}
        <View style={styles.waitTimeContainer}>
          <Text style={styles.waitTime}>
            {queueInfo?.predicted_wait_time || '~'} min
          </Text>
          <Text style={styles.waitLabel}>Estimated Wait</Text>
        </View>

        {/* Status */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {queueInfo?.status === 'waiting' ? '⏳ Waiting' :
             queueInfo?.status === 'in_progress' ? '👨‍⚕️ In Progress' :
             '✅ Completed'}
          </Text>
        </View>

        {/* Clinic Info */}
        <View style={styles.clinicInfo}>
          <Text style={styles.clinicName}>{queueInfo?.clinic_name}</Text>
          <Text style={styles.appointmentTime}>
            Scheduled: {queueInfo?.scheduled_time}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}
```

---

### Sprint 9: Performance Optimization (Semaines 17-18)

**1. Code Splitting & Lazy Loading**

```typescript
// src/App.tsx
import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load heavy components
const ClinicQueue = lazy(() => import('./pages/clinic/ClinicQueue'));
const AnalyticsDashboard = lazy(() => import('./pages/clinic/ClinicDashboard'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/clinic/queue" element={<ClinicQueue />} />
        <Route path="/clinic/analytics" element={<AnalyticsDashboard />} />
      </Routes>
    </Suspense>
  );
}
```

**2. Database Optimization**

```sql
-- Add strategic indexes
CREATE INDEX CONCURRENTLY idx_appointments_clinic_date_status 
  ON appointments(clinic_id, appointment_date, status) 
  WHERE status IN ('scheduled', 'waiting', 'in_progress');

CREATE INDEX CONCURRENTLY idx_appointments_predicted_start 
  ON appointments(predicted_start_time) 
  WHERE status = 'waiting';

-- Materialized view for analytics
CREATE MATERIALIZED VIEW clinic_daily_stats AS
SELECT 
  clinic_id,
  DATE(appointment_date) as date,
  COUNT(*) as total_appointments,
  AVG(EXTRACT(EPOCH FROM (actual_start_time - checked_in_at)) / 60) as avg_wait_time,
  SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_shows
FROM appointments
WHERE status IN ('completed', 'no_show')
GROUP BY clinic_id, DATE(appointment_date);

-- Refresh daily at 1 AM
CREATE OR REPLACE FUNCTION refresh_clinic_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic_daily_stats;
END;
$$ LANGUAGE plpgsql;
```

**3. Caching Strategy**

```typescript
// src/lib/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 300 // 5 minutes default
): Promise<T> {
  // Try cache first
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch and cache
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// Usage in service
async getQueueSummary(clinicId: string, date: Date): Promise<QueueSummary> {
  const cacheKey = `queue:summary:${clinicId}:${format(date, 'yyyy-MM-dd')}`;
  
  return getCachedOrFetch(
    cacheKey,
    () => this.fetchQueueSummaryFromDB(clinicId, date),
    60 // 1 minute TTL for real-time data
  );
}
```

---

## 📊 METRICS & MONITORING

### Setup Monitoring Stack

**1. Error Tracking (Sentry)**

```typescript
// src/lib/sentry.ts
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

**2. Performance Monitoring**

```typescript
// src/lib/performance.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric: Metric) {
  // Send to your analytics endpoint
  fetch('/api/analytics/web-vitals', {
    method: 'POST',
    body: JSON.stringify(metric),
  });
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

**3. Custom Metrics Dashboard**

```typescript
// Supabase Edge Function
export async function trackMetric(metric: CustomMetric) {
  await supabase.from('custom_metrics').insert({
    name: metric.name,
    value: metric.value,
    timestamp: new Date().toISOString(),
    tags: metric.tags
  });
}

// Usage
trackMetric({
  name: 'appointment_booking_time',
  value: Date.now() - startTime,
  tags: { clinic_id: clinicId, user_type: 'patient' }
});
```

---

## ✅ CHECKLIST DE SUCCÈS

### Phase 1 (Mois 1-3)
- [ ] Tests coverage >80%
- [ ] Clean Architecture implemented
- [ ] ML model deployed (MAE <15 min)
- [ ] CI/CD pipeline
- [ ] Error tracking active
- [ ] Documentation complète

### Phase 2 (Mois 4-6)
- [ ] Patient Portal live
- [ ] Analytics Dashboard
- [ ] WhatsApp integration
- [ ] FHIR API v1
- [ ] Performance optimized (LCP <2.5s)

### Phase 3 (Mois 7-9)
- [ ] Mobile apps (iOS + Android)
- [ ] 10+ paying clinics
- [ ] 1000+ active patients
- [ ] 99.5%+ uptime
- [ ] SOC 2 Type I preparation

---

**🎯 Next: Passez à STRATEGIC_ANALYSIS_ERP_HEALTHCARE.md pour la vision business complète!**
