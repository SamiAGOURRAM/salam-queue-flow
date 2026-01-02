# 🏥 Salam Queue Flow - Kubernetes Deployment

A cloud-native healthcare queue management application deployed on **Kubernetes** using **Minikube**.

---

## 📋 Project Overview

This project demonstrates containerization and orchestration of a React web application using:
- **Docker** - Multi-stage container build
- **Kubernetes** - Deployment with 3 replicas for high availability
- **Minikube** - Local single-node Kubernetes cluster
- **NodePort Service** - External access to the application

### Key Features for Kubernetes Demo
- ✅ **3 Replicas** - High availability with automatic load balancing
- ✅ **Visual Pod Indicator** - Each pod displays a unique colored badge showing its ID
- ✅ **Health API** - `/api/health` endpoint returns pod information
- ✅ **Self-Healing** - Kubernetes automatically replaces failed pods
- ✅ **Declarative Configuration** - All resources defined in YAML manifests

---

## 🗂️ Project Structure

```
├── Dockerfile              # Multi-stage Docker build
├── deployment.yaml         # Kubernetes Deployment (3 replicas)
├── service.yaml            # Kubernetes Service (NodePort)
├── server.js               # Express server with health endpoint
├── K8S_Guide.md            # Detailed deployment guide
├── kubernetes_report.pdf   # Detailed Kubernetes deployment report
└── src/
    └── components/
        └── PodIndicator.tsx  # Visual pod indicator component
```

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop (running)
- Minikube
- kubectl

### 1. Start Minikube
```bash
minikube start --driver=docker
```

### 2. Build the Image
```bash
minikube image build -t salam-queue:v2 .
```

### 3. Deploy to Kubernetes
```bash
# Deploy the application (3 replicas)
kubectl apply -f deployment.yaml

# Expose via NodePort service
kubectl apply -f service.yaml

# Verify pods are running
kubectl get pods
```

### 4. Access the Application
```bash
minikube service salam-service
```

---

## ✅ Assignment Requirements Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Task 1**: Start Minikube cluster | ✅ | `minikube start --driver=docker` |
| **Task 2**: Deploy with 3+ replicas | ✅ | `deployment.yaml` with `replicas: 3` |
| **Task 3**: Expose application | ✅ | `service.yaml` (NodePort, declarative) |
| **Task 4**: Prove load balancing | ✅ | Visual pod indicator + `/api/health` API |
| **Task 5**: Demonstrate self-healing | ✅ | Delete pod → Kubernetes recreates it |

---

## 🎨 Visual Pod Indicator

The application includes a **floating badge** in the bottom-right corner that displays:
- **Pod ID** - Shortened version of the Kubernetes pod name
- **Unique Color** - Each pod has a different color based on its name hash
- **Live Status** - Pulsing dot indicates the pod is active

This makes it easy to visually verify load balancing when refreshing the browser!

---

## 📊 Proving Load Balancing

### Method 1: Visual (Browser)
1. Open the application URL
2. Look at the Pod Indicator badge
3. Refresh multiple times (F5)
4. Observe the **color and pod ID changing**

### Method 2: API (Terminal)
```bash
# Get service URL
URL=$(minikube service salam-service --url)

# Send 10 requests
for i in {1..10}; do curl -s $URL/api/health; echo ""; done
```

**Expected Output:**
```json
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-xxx-abc"}
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-xxx-xyz"}
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-xxx-def"}
```

---

## 🔄 Proving Self-Healing

```bash
# List pods
kubectl get pods

# Delete one pod
kubectl delete pod <pod-name>

# Watch Kubernetes recreate it automatically
kubectl get pods -w
```

---

## 📚 Files Description

### `Dockerfile`
Multi-stage build:
1. **Builder stage**: Compiles React/TypeScript to static files
2. **Runner stage**: Lightweight Node.js server with Express

### `deployment.yaml`
Kubernetes Deployment manifest:
- 3 replicas for high availability
- Uses locally built image (`imagePullPolicy: Never`)
- Container port 3000

### `service.yaml`
Kubernetes Service manifest:
- Type: NodePort (external access)
- Routes port 80 → container port 3000
- Fixed NodePort: 30080

### `server.js`
Express server:
- Serves static React build from `/dist`
- `/api/health` endpoint returns pod ID
- Handles React Router (SPA routing)

---

## 👨‍💻 Authors

Sami Agourram - Soufiane El Amrani  
University Mohammed VI Polytechnic  
M311 – Cloud Computing | Fall 2025

