# 🚀 Salam Queue Flow: Kubernetes Deployment Guide

This guide explains how to deploy the application locally using **Minikube**.
The setup uses declarative YAML manifests for both Deployment and Service.

## 📋 Prerequisites
- Minikube installed
- Kubectl installed
- Docker installed

---

## 1️⃣ Start the Infrastructure

Reset the cluster to ensure a clean state (optional but recommended for demos).

```bash
# 1. Reset (If you want a fresh start)
minikube delete

# 2. Start the Cluster (Using Docker driver)
minikube start --driver=docker

# 3. Verify the cluster is running
minikube status
kubectl get nodes
```

---

## 2️⃣ Build the Image

We build the image **inside** Minikube's internal Docker daemon so Kubernetes can see it without a registry push.

```bash
# Note: The '.' at the end is critical (Build Context)
minikube image build -t salam-queue:v2 .
```

* **Why v2?** To ensure we aren't using a cached/stale version.
* **Troubleshooting:** If the build fails, ensure your `.env` file exists and contains the Supabase keys.

---

## 3️⃣ Deploy to Kubernetes (Declarative)

We use YAML manifests to deploy both the Deployment and Service declaratively.

### Deploy the Application (3 Replicas)

```bash
# Apply the Deployment manifest
kubectl apply -f deployment.yaml

# Verify pods are running
kubectl get pods -w
```

* **Expected Output:** You should see 3 pods switch from `ContainerCreating` to `Running`.

### Expose the Service (Declarative)

```bash
# Apply the Service manifest
kubectl apply -f service.yaml

# Verify the service was created
kubectl get services
```

**Manifest Files:**
- `deployment.yaml` - Manages 3 replicas of the application
- `service.yaml` - Exposes the application via NodePort

---

## 4️⃣ Access the Application

### **A. Get the URL**

```bash
minikube service salam-service --url
```

Or open directly in browser:

```bash
minikube service salam-service
```

### **B. Visual Pod Indicator** 🎨

When you open the application in your browser, you'll see a **colored badge in the bottom-right corner** showing:
- The Pod ID serving your request
- A unique color based on the pod name
- A pulsing dot indicating live status

**Each pod has a different color!** Refresh the page multiple times to see different pods serving your requests.

---

## 5️⃣ Prove Load Balancing

### Via API (Terminal)

Run this loop to see traffic hitting different replicas:

```bash
# Get the service URL
URL=$(minikube service salam-service --url)

# Send 10 requests and observe different pod IDs
for i in {1..10}; do curl -s $URL/api/health | jq; done
```

**Expected Output:**

```json
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-85b65...-abc"}
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-85b65...-xyz"}
{"status":"ok","message":"Salam Queue is running!","pod_id":"salam-queue-85b65...-def"}
```

### Via Browser (Visual)

1. Open the application URL in your browser
2. Look at the **Pod Indicator badge** in the bottom-right corner
3. Refresh the page several times (F5)
4. Notice the **color and pod ID changing** as different pods serve requests

---

## 6️⃣ Prove Self-Healing (Resilience)

### Delete a Pod

```bash
# List current pods
kubectl get pods

# Delete one of the pods (replace with actual pod name)
kubectl delete pod <pod-name>

# Watch Kubernetes recreate the pod automatically
kubectl get pods -w
```

**Expected behavior:** Kubernetes will immediately spin up a new pod to maintain 3 replicas.

---

## 🛠 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Pods stuck in `ImagePullBackOff`** | You forgot to build the image inside Minikube. Run `minikube image build -t salam-queue:v2 .` |
| **Connection Refused** | Did you apply the Service? Run `kubectl apply -f service.yaml` |
| **Pods not running** | Check pod logs: `kubectl logs <pod-name>` |
| **Can't access from browser** | Make sure Minikube tunnel is running: `minikube service salam-service` |

---

## 📁 Project Files

| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage build (builder + runner) |
| `deployment.yaml` | Kubernetes Deployment (3 replicas) |
| `service.yaml` | Kubernetes Service (NodePort) |
| `server.js` | Express server with `/api/health` endpoint |
| `src/components/PodIndicator.tsx` | Visual pod indicator component |

---

## ✅ Assignment Checklist

- [x] Minikube runs locally on your laptop (single node)
- [x] App runs in 3+ identical copies (replicas: 3)
- [x] Service is reachable via NodePort
- [x] Automatic load balancing proven (different pod IDs in responses + visual indicator)
- [x] Automatic recovery proven (self-healing after pod deletion)
- [x] **All manifests are declarative (YAML)** - No imperative `kubectl expose` commands
