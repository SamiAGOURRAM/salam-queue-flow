# 🚀 Salam Queue Flow: Kubernetes Deployment Guide

This guide explains how to deploy the application locally using **Minikube**.
Since this is a Codespaces/Docker environment, we build images directly inside the cluster.

## 📋 Prerequisites
- Minikube installed
- Kubectl installed
- Docker installed

## 1️⃣ Start the Infrastructure
Reset the cluster to ensure a clean state (optional but recommended for demos).

```bash
# 1. Reset (If you want a fresh start)
minikube delete

# 2. Start the Cluster (Using Docker driver for Codespaces)
minikube start --driver=docker
````

## 2️⃣ Build the Image

We build the image **inside** Minikube's internal Docker daemon so Kubernetes can see it without a registry push.

```bash
# Note: The '.' at the end is critical (Build Context)
minikube image build -t salam-queue:v2 .
```

  * **Why v2?** To ensure we aren't using a cached/stale version.
  * **Troubleshooting:** If the build fails, ensure your `.env` file exists and contains the Supabase keys.

## 3️⃣ Deploy to Kubernetes

We use a Deployment to manage 3 replicas for High Availability.

```bash
# 1. Apply the Deployment Blueprint
kubectl apply -f deployment.yaml

# 2. Verify pods are running
kubectl get pods -w
```

  * **Expected Output:** You should see 3 pods switch from `ContainerCreating` to `Running`.

## 4️⃣ Expose the Service (The Door)

We use a **NodePort** service to expose the application to the outside world.

```bash
# Expose port 3000 (Container) to a random external port
kubectl expose deployment salam-queue --type=NodePort --port=80 --target-port=3000 --name=salam-service
```

## 5️⃣ Verification (The "Proof")

### **A. Get the URL**

Since we are in a headless environment, ask Minikube for the accessible URL:

```bash
minikube service salam-service --url
```

### **B. Prove Load Balancing**

Run this loop to see traffic hitting different replicas (Pod IDs):

```bash
# Replace <URL> with the output from the previous step
# Don't forget to add /api/health at the end!

for i in {1..10}; do curl -s <YOUR_URL>/api/health; echo ""; done
```

**Expected Output:**

```json
{"status":"ok", "pod_id":"salam-queue-85b65...-abc"}
{"status":"ok", "pod_id":"salam-queue-85b65...-xyz"}
```

-----

## 🛠 Troubleshooting

  * **Pods stuck in `ImagePullBackOff`?**
      * You probably forgot to build the image inside Minikube. Run Step 2 again.
  * **Connection Refused?**
      * Did you create the Service (Step 4)?
      * Are the pods actually `Running` (Step 3)?

<!-- end list -->

```
