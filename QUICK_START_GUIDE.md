# 🚀 Guide de Démarrage Rapide - Quick Wins
## Actions Immédiates pour Améliorer Salam Queue Flow

---

## 📋 TABLE DES MATIÈRES

1. [Setup Initial (Aujourd'hui)](#setup-initial)
2. [Tests Unitaires (Cette Semaine)](#tests-unitaires)
3. [ML Baseline (Cette Semaine)](#ml-baseline)
4. [Optimisations Performance (Cette Semaine)](#optimisations-performance)
5. [Features Quick Wins (Ce Mois)](#features-quick-wins)

---

## 🎯 SETUP INITIAL (Aujourd'hui - 2h)

### 1. Installation des Dépendances Essentielles

```bash
# Testing
npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/user-event
npm install --save-dev @testing-library/jest-dom happy-dom

# Code Quality
npm install --save-dev eslint-plugin-security
npm install --save-dev prettier eslint-config-prettier

# Monitoring
npm install @sentry/react @sentry/vite-plugin

# Performance
npm install --save-dev @vitejs/plugin-legacy
npm install web-vitals

# Utilities
npm install date-fns-tz zod react-hook-form
```

### 2. Configuration Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/*',
        'src/main.tsx'
      ],
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

```typescript
// src/test/setup.ts
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
```

### 3. Configuration Sentry

```typescript
// src/lib/monitoring.ts
import * as Sentry from '@sentry/react';

export function initMonitoring() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      beforeSend(event, hint) {
        // Filter out sensitive data
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
        }
        return event;
      }
    });
  }
}

// Update src/main.tsx
import { initMonitoring } from './lib/monitoring';

initMonitoring();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 4. Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json}\"",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 🧪 TESTS UNITAIRES (Cette Semaine - 8h)

### Test QueueService

```typescript
// src/services/queue/__tests__/QueueService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../QueueService';
import { QueueRepository } from '../repositories/QueueRepository';
import { AppointmentStatus } from '../models/QueueModels';

// Mock repository
vi.mock('../repositories/QueueRepository');

describe('QueueService', () => {
  let service: QueueService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      getQueueByDate: vi.fn(),
      createQueueEntry: vi.fn(),
      getQueueEntryById: vi.fn(),
      updateQueueEntry: vi.fn(),
      createAbsentPatient: vi.fn(),
      createQueueOverride: vi.fn(),
    };
    
    service = new QueueService(mockRepo);
  });

  describe('getQueueSummary', () => {
    it('should calculate summary correctly', async () => {
      // Arrange
      const mockQueue = [
        { 
          status: AppointmentStatus.WAITING, 
          skipReason: null, 
          returnedAt: null 
        },
        { 
          status: AppointmentStatus.WAITING, 
          skipReason: null, 
          returnedAt: null 
        },
        { 
          status: AppointmentStatus.IN_PROGRESS 
        },
        { 
          status: AppointmentStatus.COMPLETED,
          checkedInAt: new Date('2024-01-01T09:00:00'),
          actualStartTime: new Date('2024-01-01T09:15:00')
        },
        { 
          status: AppointmentStatus.WAITING,
          skipReason: 'patient_absent', 
          returnedAt: null,
          markedAbsentAt: new Date()
        },
      ];

      mockRepo.getQueueByDate.mockResolvedValue(mockQueue);

      // Act
      const summary = await service.getQueueSummary('clinic-1', new Date());

      // Assert
      expect(summary).toMatchObject({
        totalAppointments: 5,
        waiting: 2,
        inProgress: 1,
        completed: 1,
        absent: 1,
        averageWaitTime: 15,
        currentQueueLength: 2
      });
    });
  });

  describe('markPatientAbsent', () => {
    it('should mark patient absent and create record', async () => {
      // Arrange
      const mockEntry = {
        id: 'apt-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        status: AppointmentStatus.WAITING,
        queuePosition: 3,
        markedAbsentAt: null,
        returnedAt: null
      };

      mockRepo.getQueueEntryById.mockResolvedValue(mockEntry);
      mockRepo.updateQueueEntry.mockResolvedValue({
        ...mockEntry,
        isPresent: false,
        skipReason: 'patient_absent',
        markedAbsentAt: expect.any(String)
      });

      // Act
      const result = await service.markPatientAbsent({
        appointmentId: 'apt-1',
        performedBy: 'staff-1',
        gracePeriodMinutes: 15,
        reason: 'Not present when called'
      });

      // Assert
      expect(result.isPresent).toBe(false);
      expect(result.skipReason).toBe('patient_absent');
      expect(mockRepo.createAbsentPatient).toHaveBeenCalled();
      expect(mockRepo.createQueueOverride).toHaveBeenCalled();
    });

    it('should throw error if already marked absent', async () => {
      // Arrange
      mockRepo.getQueueEntryById.mockResolvedValue({
        id: 'apt-1',
        markedAbsentAt: new Date(),
        returnedAt: null
      });

      // Act & Assert
      await expect(
        service.markPatientAbsent({
          appointmentId: 'apt-1',
          performedBy: 'staff-1',
          gracePeriodMinutes: 15
        })
      ).rejects.toThrow('already marked as absent');
    });
  });

  describe('addToQueue', () => {
    it('should prevent booking past dates', async () => {
      // Arrange
      const pastDate = new Date('2020-01-01');

      // Act & Assert
      await expect(
        service.addToQueue({
          clinicId: 'clinic-1',
          patientId: 'patient-1',
          staffId: 'staff-1',
          appointmentDate: pastDate,
          appointmentType: 'consultation'
        })
      ).rejects.toThrow('Cannot create appointments for past dates');
    });

    it('should auto-assign queue position', async () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      mockRepo.createQueueEntry.mockResolvedValue({
        id: 'apt-1',
        queuePosition: 5,
        status: AppointmentStatus.SCHEDULED
      });

      // Act
      const result = await service.addToQueue({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        staffId: 'staff-1',
        appointmentDate: futureDate,
        appointmentType: 'consultation'
      });

      // Assert
      expect(result.queuePosition).toBe(5);
      expect(mockRepo.createQueueEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          autoAssignPosition: true
        })
      );
    });
  });
});
```

### Test React Components

```typescript
// src/components/clinic/__tests__/EnhancedQueueManager.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedQueueManager } from '../EnhancedQueueManager';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useQueueService hook
vi.mock('@/hooks/useQueueService', () => ({
  useQueueService: () => ({
    queue: [
      {
        id: '1',
        patient: { fullName: 'Ahmed Hassan' },
        status: 'waiting',
        queuePosition: 1,
        skipReason: null
      },
      {
        id: '2',
        patient: { fullName: 'Fatima Zahra' },
        status: 'in_progress',
        queuePosition: null
      }
    ],
    summary: {
      waiting: 1,
      inProgress: 1,
      absent: 0
    },
    isLoading: false,
    error: null,
    callNextPatient: vi.fn(),
    markPatientAbsent: vi.fn(),
    completeAppointment: vi.fn()
  })
}));

describe('EnhancedQueueManager', () => {
  const renderWithClient = (component: React.ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    });

    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  it('should render queue summary', () => {
    renderWithClient(
      <EnhancedQueueManager clinicId="clinic-1" userId="user-1" />
    );

    expect(screen.getByText(/1/)).toBeInTheDocument(); // waiting count
    expect(screen.getByText(/1/)).toBeInTheDocument(); // in progress count
  });

  it('should display patient in progress', () => {
    renderWithClient(
      <EnhancedQueueManager clinicId="clinic-1" userId="user-1" />
    );

    expect(screen.getByText('Fatima Zahra')).toBeInTheDocument();
  });

  it('should call next patient on button click', async () => {
    const user = userEvent.setup();
    const mockCallNext = vi.fn();

    vi.mocked(useQueueService).mockReturnValue({
      ...defaultMockReturn,
      callNextPatient: mockCallNext
    });

    renderWithClient(
      <EnhancedQueueManager clinicId="clinic-1" userId="user-1" />
    );

    const nextButton = screen.getByRole('button', { name: /next patient/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(mockCallNext).toHaveBeenCalledWith('user-1');
    });
  });
});
```

**Run Tests:**

```bash
npm run test              # Watch mode
npm run test:coverage     # With coverage report
npm run test:ui           # Visual UI
```

---

## 🤖 ML BASELINE (Cette Semaine - 6h)

### 1. Setup Python Environment

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pandas scikit-learn joblib python-dotenv supabase
pip install pydantic numpy
```

### 2. Simple Training Script

```python
# scripts/train_wait_time_model.py
import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Connect to Supabase
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

def fetch_training_data():
    """Fetch completed appointments from Supabase"""
    print("Fetching training data...")
    
    response = supabase.table('appointments').select(
        '''
        *,
        clinic:clinics(settings)
        '''
    ).eq('status', 'completed').not_.is_('actual_start_time', 'null').execute()
    
    df = pd.DataFrame(response.data)
    print(f"Fetched {len(df)} completed appointments")
    return df

def prepare_features(df):
    """Feature engineering"""
    print("Preparing features...")
    
    # Calculate actual wait time (target variable)
    df['actual_wait_time'] = (
        pd.to_datetime(df['actual_start_time']) - 
        pd.to_datetime(df['checked_in_at'])
    ).dt.total_seconds() / 60
    
    # Extract temporal features
    df['appointment_datetime'] = pd.to_datetime(df['appointment_date']) + pd.to_timedelta(
        df['scheduled_time'].fillna('09:00') + ':00'
    )
    df['hour'] = df['appointment_datetime'].dt.hour
    df['day_of_week'] = df['appointment_datetime'].dt.dayofweek
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    
    # Encode categorical features
    appointment_type_map = {
        'consultation': 0,
        'follow_up': 1,
        'emergency': 2,
        'procedure': 3,
        'vaccination': 4,
        'screening': 5
    }
    df['appointment_type_encoded'] = df['appointment_type'].map(appointment_type_map).fillna(0)
    
    # Time slot encoding
    df['time_slot_encoded'] = df['time_slot'].map({
        'morning': 0,
        'afternoon': 1,
        'evening': 2
    }).fillna(0)
    
    # Fill missing values
    df['queue_position'] = df['queue_position'].fillna(1)
    df['estimated_duration'] = df['estimated_duration'].fillna(15)
    df['is_first_visit'] = df['is_first_visit'].fillna(False).astype(int)
    
    # Select features
    feature_columns = [
        'queue_position',
        'appointment_type_encoded',
        'day_of_week',
        'hour',
        'is_first_visit',
        'estimated_duration',
        'time_slot_encoded',
        'is_weekend'
    ]
    
    # Filter valid records
    df_clean = df[
        (df['actual_wait_time'] > 0) & 
        (df['actual_wait_time'] < 300)  # Less than 5 hours
    ].copy()
    
    print(f"Clean dataset: {len(df_clean)} records")
    
    return df_clean[feature_columns], df_clean['actual_wait_time']

def train_model(X, y):
    """Train Random Forest model"""
    print("\nTraining model...")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Train model
    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    
    print(f"\n=== Model Performance ===")
    print(f"MAE:  {mae:.2f} minutes")
    print(f"RMSE: {rmse:.2f} minutes")
    print(f"R²:   {r2:.3f}")
    
    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': X.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    print(f"\n=== Feature Importance ===")
    print(feature_importance.to_string(index=False))
    
    return model, {
        'mae': mae,
        'rmse': rmse,
        'r2': r2,
        'feature_importance': feature_importance.to_dict('records')
    }

def save_model(model, metrics):
    """Save model and metadata"""
    os.makedirs('models', exist_ok=True)
    
    # Save model
    model_path = 'models/wait_time_predictor_v1.pkl'
    joblib.dump(model, model_path)
    print(f"\n✅ Model saved to {model_path}")
    
    # Save metrics
    import json
    with open('models/metrics.json', 'w') as f:
        # Convert numpy types to native Python types
        metrics_serializable = {
            'mae': float(metrics['mae']),
            'rmse': float(metrics['rmse']),
            'r2': float(metrics['r2']),
            'feature_importance': metrics['feature_importance']
        }
        json.dump(metrics_serializable, f, indent=2)
    print(f"✅ Metrics saved to models/metrics.json")

if __name__ == '__main__':
    print("🚀 Starting Wait Time Model Training\n")
    
    try:
        # Fetch data
        df = fetch_training_data()
        
        if len(df) < 100:
            print("⚠️  Warning: Less than 100 records. Model may not be accurate.")
        
        # Prepare features
        X, y = prepare_features(df)
        
        # Train
        model, metrics = train_model(X, y)
        
        # Save
        save_model(model, metrics)
        
        print("\n✨ Training complete!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
```

### 3. Simple Prediction API

```python
# api/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import os

app = FastAPI(title="Wait Time Prediction API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model on startup
MODEL_PATH = os.getenv('MODEL_PATH', 'models/wait_time_predictor_v1.pkl')
model = None

@app.on_event("startup")
async def load_model():
    global model
    try:
        model = joblib.load(MODEL_PATH)
        print(f"✅ Model loaded from {MODEL_PATH}")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")

class PredictionRequest(BaseModel):
    queue_position: int
    appointment_type: str  # consultation, follow_up, etc.
    day_of_week: int  # 0-6
    hour: int  # 0-23
    is_first_visit: bool
    estimated_duration: int  # minutes
    time_slot: str  # morning, afternoon, evening

class PredictionResponse(BaseModel):
    predicted_wait_time: float
    confidence_low: float
    confidence_high: float
    message: str

@app.post("/predict", response_model=PredictionResponse)
async def predict_wait_time(req: PredictionRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Encode features
        appointment_type_map = {
            'consultation': 0, 'follow_up': 1, 'emergency': 2,
            'procedure': 3, 'vaccination': 4, 'screening': 5
        }
        time_slot_map = {'morning': 0, 'afternoon': 1, 'evening': 2}
        
        features = np.array([[
            req.queue_position,
            appointment_type_map.get(req.appointment_type, 0),
            req.day_of_week,
            req.hour,
            int(req.is_first_visit),
            req.estimated_duration,
            time_slot_map.get(req.time_slot, 0),
            int(req.day_of_week in [5, 6])  # is_weekend
        ]])
        
        # Predict
        prediction = model.predict(features)[0]
        
        # Simple confidence interval (±20%)
        confidence_range = prediction * 0.2
        
        return PredictionResponse(
            predicted_wait_time=round(prediction, 1),
            confidence_low=round(max(0, prediction - confidence_range), 1),
            confidence_high=round(prediction + confidence_range, 1),
            message=f"Estimated wait: {int(prediction)} minutes"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }

@app.get("/")
async def root():
    return {
        "service": "Wait Time Prediction API",
        "version": "1.0.0",
        "endpoints": {
            "predict": "POST /predict",
            "health": "GET /health"
        }
    }
```

**Run API:**

```bash
# Install
pip install "fastapi[all]"

# Run
uvicorn api.main:app --reload --port 8000

# Test
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "queue_position": 3,
    "appointment_type": "consultation",
    "day_of_week": 1,
    "hour": 10,
    "is_first_visit": false,
    "estimated_duration": 15,
    "time_slot": "morning"
  }'
```

### 4. Integration Frontend

```typescript
// src/services/ml/WaitTimePredictionService.ts
export interface PredictionInput {
  queuePosition: number;
  appointmentType: string;
  dayOfWeek: number;
  hour: number;
  isFirstVisit: boolean;
  estimatedDuration: number;
  timeSlot: string;
}

export interface PredictionResult {
  predicted_wait_time: number;
  confidence_low: number;
  confidence_high: number;
  message: string;
}

export class WaitTimePredictionService {
  private apiUrl = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000';

  async predict(input: PredictionInput): Promise<PredictionResult> {
    try {
      const response = await fetch(`${this.apiUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`Prediction failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('ML prediction error:', error);
      // Fallback to simple calculation
      return this.fallbackPrediction(input);
    }
  }

  private fallbackPrediction(input: PredictionInput): PredictionResult {
    const baseWait = input.queuePosition * input.estimatedDuration;
    return {
      predicted_wait_time: baseWait,
      confidence_low: baseWait * 0.8,
      confidence_high: baseWait * 1.2,
      message: `Estimated wait: ${baseWait} minutes (fallback)`
    };
  }
}

// Usage in component
const predictionService = new WaitTimePredictionService();

const updateWaitTimePrediction = async (appointmentId: string) => {
  const appointment = await getAppointment(appointmentId);
  
  const prediction = await predictionService.predict({
    queuePosition: appointment.queue_position,
    appointmentType: appointment.appointment_type,
    dayOfWeek: new Date(appointment.appointment_date).getDay(),
    hour: parseInt(appointment.scheduled_time.split(':')[0]),
    isFirstVisit: appointment.is_first_visit,
    estimatedDuration: appointment.estimated_duration,
    timeSlot: appointment.time_slot
  });

  // Update appointment with prediction
  await supabase
    .from('appointments')
    .update({
      predicted_wait_time: Math.round(prediction.predicted_wait_time),
      prediction_confidence: (prediction.confidence_high - prediction.confidence_low) / prediction.predicted_wait_time
    })
    .eq('id', appointmentId);

  return prediction;
};
```

---

## ⚡ OPTIMISATIONS PERFORMANCE (Cette Semaine - 4h)

### 1. Database Indexes

```sql
-- Ajoutez ces indexes via Supabase SQL Editor

-- Performance critique pour queries queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_queue_active 
ON appointments(clinic_id, appointment_date, queue_position, status)
WHERE status IN ('scheduled', 'waiting', 'in_progress');

-- Recherche rapide par patient
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_patient_recent
ON appointments(patient_id, appointment_date DESC)
WHERE appointment_date > CURRENT_DATE - INTERVAL '6 months';

-- Analytics queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_analytics
ON appointments(clinic_id, appointment_date, status, appointment_type)
WHERE status IN ('completed', 'cancelled', 'no_show');

-- Notifications batch processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_notification_pending
ON appointments(predicted_start_time)
WHERE status = 'waiting' AND last_notification_sent_at IS NULL;
```

### 2. Query Optimization

```typescript
// ❌ Bad: Fetches too much data
const getQueue = async (clinicId: string) => {
  const { data } = await supabase
    .from('appointments')
    .select('*')  // Too broad
    .eq('clinic_id', clinicId);
  return data;
};

// ✅ Good: Fetches only what's needed
const getQueue = async (clinicId: string, date: string) => {
  const { data } = await supabase
    .from('appointments')
    .select(`
      id,
      queue_position,
      status,
      predicted_wait_time,
      patient:profiles!inner(
        id,
        full_name
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('appointment_date', date)
    .in('status', ['scheduled', 'waiting', 'in_progress'])
    .order('queue_position', { ascending: true });
  
  return data;
};
```

### 3. Component Optimization

```typescript
// ❌ Bad: Re-renders entire list on every change
export function QueueList({ queue }: Props) {
  return (
    <div>
      {queue.map(item => (
        <QueueItem key={item.id} item={item} />
      ))}
    </div>
  );
}

// ✅ Good: Memoized items
export function QueueList({ queue }: Props) {
  return (
    <div>
      {queue.map(item => (
        <MemoizedQueueItem key={item.id} item={item} />
      ))}
    </div>
  );
}

const MemoizedQueueItem = memo(QueueItem, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.status === next.item.status &&
    prev.item.queue_position === next.item.queue_position
  );
});
```

### 4. React Query Optimizations

```typescript
// src/hooks/useQueueService.tsx
export function useQueueService({ clinicId, date }: Props) {
  // ✅ Smart refetch intervals
  const { data: queue } = useQuery({
    queryKey: ['queue', clinicId, date],
    queryFn: () => fetchQueue(clinicId, date),
    refetchInterval: 30000, // 30 seconds
    staleTime: 15000, // Consider stale after 15s
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  // ✅ Prefetch next hour's queue
  const queryClient = useQueryClient();
  useEffect(() => {
    const nextHour = addHours(new Date(date), 1);
    queryClient.prefetchQuery({
      queryKey: ['queue', clinicId, format(nextHour, 'yyyy-MM-dd')],
      queryFn: () => fetchQueue(clinicId, format(nextHour, 'yyyy-MM-dd'))
    });
  }, [clinicId, date]);

  return { queue };
}
```

---

## 🎁 FEATURES QUICK WINS (Ce Mois - 20h)

### 1. Ratings & Reviews System

```typescript
// src/components/clinic/RatingDialog.tsx
export function RatingDialog({ appointmentId, onClose }: Props) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');

  const submitRating = async () => {
    await supabase.from('clinic_ratings').insert({
      appointment_id: appointmentId,
      rating,
      review,
      created_at: new Date().toISOString()
    });

    toast.success('Thank you for your feedback!');
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate Your Experience</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Star Rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="text-3xl transition-colors"
              >
                {star <= rating ? '⭐' : '☆'}
              </button>
            ))}
          </div>

          {/* Review Text */}
          <Textarea
            placeholder="Share your experience (optional)"
            value={review}
            onChange={e => setReview(e.target.value)}
            rows={4}
          />

          <Button onClick={submitRating} disabled={rating === 0}>
            Submit Rating
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 2. SMS Reminders (Day Before)

```typescript
// Supabase Edge Function: send-appointment-reminders
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get tomorrow's appointments
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_time,
      patient:profiles(phone_number, full_name),
      clinic:clinics(name, address)
    `)
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'scheduled')
    .is('reminder_sent', false);

  // Send reminders
  for (const apt of appointments || []) {
    const message = `Reminder: You have an appointment tomorrow at ${apt.clinic.name} at ${apt.scheduled_time}. Location: ${apt.clinic.address}`;

    // Send SMS
    await fetch(Deno.env.get('SUPABASE_URL')! + '/functions/v1/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({
        to: apt.patient.phone_number,
        message,
        notification_id: crypto.randomUUID()
      })
    });

    // Mark as sent
    await supabase
      .from('appointments')
      .update({ reminder_sent: true })
      .eq('id', apt.id);
  }

  return new Response(
    JSON.stringify({ sent: appointments?.length || 0 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

**Setup cron job in Supabase:**
```sql
-- Run daily at 6 PM
SELECT cron.schedule(
  'send-appointment-reminders',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/send-appointment-reminders',
    headers:='{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )
  $$
);
```

### 3. Export Analytics (Excel/PDF)

```typescript
// src/lib/export.ts
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export async function exportQueueToPDF(
  clinic: Clinic,
  date: Date,
  queue: QueueEntry[]
) {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.text(`Queue Report - ${clinic.name}`, 14, 20);
  doc.setFontSize(10);
  doc.text(`Date: ${format(date, 'MMMM dd, yyyy')}`, 14, 28);

  // Table
  autoTable(doc, {
    startY: 35,
    head: [['Position', 'Patient', 'Type', 'Status', 'Wait Time']],
    body: queue.map(item => [
      item.queue_position || '-',
      item.patient?.fullName || 'Guest',
      item.appointmentType,
      item.status,
      item.predicted_wait_time ? `${item.predicted_wait_time} min` : '-'
    ])
  });

  // Save
  doc.save(`queue-${format(date, 'yyyy-MM-dd')}.pdf`);
}

export async function exportAnalyticsToExcel(data: AnalyticsData) {
  const ws = XLSX.utils.json_to_sheet(data.daily);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Stats');

  XLSX.writeFile(wb, `analytics-${Date.now()}.xlsx`);
}
```

---

## ✅ CHECKLIST PREMIÈRE SEMAINE

### Jour 1-2: Setup
- [ ] Install testing dependencies
- [ ] Configure Vitest
- [ ] Setup Sentry monitoring
- [ ] Add package.json scripts
- [ ] Commit changes

### Jour 3-4: Tests
- [ ] Write QueueService tests
- [ ] Write component tests
- [ ] Achieve 50%+ coverage
- [ ] Setup CI to run tests
- [ ] Fix any failing tests

### Jour 5: ML Baseline
- [ ] Create Python environment
- [ ] Write training script
- [ ] Train baseline model
- [ ] Test predictions locally
- [ ] Document results

### Jour 6-7: Quick Features
- [ ] Add ratings system
- [ ] Setup SMS reminders cron
- [ ] Add export to PDF
- [ ] Test end-to-end
- [ ] Deploy to staging

---

## 📈 PROCHAINES ÉTAPES

**Semaine 2:**
- Mobile app setup (React Native)
- WhatsApp integration
- Advanced analytics dashboard

**Semaine 3:**
- Patient portal
- Medical history timeline
- Document uploads

**Semaine 4:**
- Performance optimization
- Load testing
- Production deployment

---

**🎉 Vous êtes prêt à démarrer! Choisissez une tâche et commencez maintenant!**

**Questions? Consultez:**
- `STRATEGIC_ANALYSIS_ERP_HEALTHCARE.md` - Vision stratégique complète
- `IMPLEMENTATION_ROADMAP_2025.md` - Roadmap technique détaillée
- `ARCHITECTURE_ANALYSIS.md` - Architecture existante

---

*Bon courage! 🚀*
