# 🤖 ML Wait Time Prediction: Design Summary

**Quick Reference Guide** - For implementation decisions

---

## 🎯 Key Decision: Feature-Based (No Time Series)

**Why?**
- ✅ Simpler to implement and maintain
- ✅ More interpretable (can explain predictions)
- ✅ Works with missing data
- ✅ Fast inference (< 100ms)
- ✅ Your idea "number of people before" is the core feature!

**What?**
- **Model**: Random Forest Regression (or XGBoost)
- **Approach**: Each prediction is independent (snapshot → wait time)
- **No Temporal Sequences**: No need for historical sequences

---

## 🎯 Core Features (Your Ideas + More)

### **1. "Number of People Before"** ✅ YOUR IDEA
- `queue_position`: Position in queue
- `people_ahead_count`: Number ahead
- `waiting_count`: Total waiting

### **2. "Type of Appointments"** ✅ YOUR IDEA
- `appointment_type`: consultation, follow_up, emergency
- `estimated_duration_minutes`: Expected duration
- `is_first_visit`: Complexity indicator

### **3. Additional Critical Features**
- `active_staff_count`: Staff capacity (more staff = faster)
- `recent_completion_rate`: Queue velocity (how fast queue moves)
- `average_service_duration`: How long each person takes
- `historical_avg_wait_time`: Baseline from history
- `expected_queue_clearance_time`: Derived estimate (people_ahead * duration / staff)

---

## 📊 Feature Priority Tiers

### **Tier 1: Core (15 features)** - Must Have
1. `queue_position`
2. `people_ahead_count`
3. `active_staff_count`
4. `appointment_type`
5. `estimated_duration_minutes`
6. `recent_completion_rate`
7. `average_service_duration`
8. `staff_utilization_rate`
9. `historical_avg_wait_time`
10. `historical_avg_service_duration`
11. `waiting_count`
12. `in_progress_count`
13. `expected_queue_clearance_time`
14. `disruptions_count_today`
15. `cumulative_delay_minutes`

### **Tier 2: Important (20 features)** - Should Have
- Temporal: `hour_of_day`, `day_of_week`
- Patient: `patient_punctuality_score`, `patient_total_visits`
- Staff: `assigned_staff_avg_duration`
- Historical: `historical_wait_time_p90`, `wait_time_trend`

### **Tier 3: Context (15+ features)** - Nice to Have
- Cultural: `is_holiday`, `is_ramadan`
- Clinic: `clinic_specialty`, `clinic_city`
- Derived: `queue_load_ratio`, `overload_factor`

---

## 🤖 Model: Random Forest Regression

**Why Random Forest?**
- ✅ Handles non-linearity (complex relationships)
- ✅ Feature importance (explainability)
- ✅ Robust to outliers
- ✅ Fast inference (< 100ms)
- ✅ No feature scaling needed
- ✅ Works with mixed types (categorical + numerical)

**Alternative**: XGBoost (better accuracy, more complex)

**Recommendation**: Start with Random Forest → Upgrade to XGBoost if needed

---

## 📐 Architecture

```
Frontend → Edge Function → ML Service (Python/FastAPI)
                            ↓
                    1. Fetch appointment data
                    2. Feature engineering
                    3. Model inference
                    4. Return { waitTimeMinutes, confidence }
```

**Key Principle**: Each prediction is a snapshot (current state → wait time)

---

## 📊 Training Data Requirements

**Minimum**:
- 100 completed appointments per clinic (initial model)
- 500+ completed appointments (accurate model)
- 1000+ completed appointments (robust model)

**Per Type**: 20-50 appointments of each appointment type

**Current**: Check `appointment_metrics` table for available data

---

## 🎯 Success Metrics

**Performance**:
- MAE < 8 minutes (average error)
- RMSE < 12 minutes (penalizes large errors)
- Accuracy (within 10 min) > 70%
- R² > 0.6 (model fit)

**Production**:
- Inference time < 100ms
- 99%+ uptime
- Graceful fallback to rule-based

---

## 🚀 Implementation Roadmap

### **Week 1: Feature Engineering**
- Define feature set ✅ (this document)
- Implement feature computation functions
- Test on sample data

### **Week 2: Model Development**
- Collect training data (1000+ samples)
- Train Random Forest model
- Evaluate on test set
- Tune hyperparameters

### **Week 3: Integration**
- Deploy ML service (Python/FastAPI)
- Integrate with Edge Function
- Test end-to-end flow

### **Week 4+: Monitoring & Iteration**
- Monitor accuracy
- Retrain monthly
- A/B test against rule-based

---

## 💡 Key Insights

1. **"Number of people before" is the core feature** - Build around this!
2. **Feature-based avoids time series complexity** - Simpler, more reliable
3. **Random Forest is perfect** - Handles complexity, fast, interpretable
4. **Start simple** - Tier 1 features first, add incrementally
5. **Moroccan context matters** - `is_ramadan`, `is_holiday` features

---

## 🔍 Industry Inspiration

- **Doctolib**: Feature-based, uses "people ahead" as primary feature ✅
- **Hospital ED**: Random Forest, queue position + staff capacity
- **Restaurant Systems**: Similar problem, same solution

---

## 📚 Full Documentation

See `docs/ML_FEATURE_BASED_DESIGN.md` for complete design:
- Detailed feature descriptions
- Feature engineering pipeline
- Model architecture
- Training strategy
- Best practices

---

**Bottom Line**: Feature-based approach is the right choice. Your ideas ("number of people before", "type of appointments") are spot-on. Build a Random Forest model around these features and you'll have an accurate, interpretable system! 🚀

