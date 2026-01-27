# Build and push
docker build -t metaspeed-token-server:local .
docker save metaspeed-token-server:local | microk8s ctr image import -


# Verify it exists
microk8s ctr image ls | grep -F "docker.io/library/metaspeed-token-server:local"

# Setup k8s YAML
cat > metaspeed-token-server.yaml <<'YAML'
apiVersion: v1
kind: Namespace
metadata:
  name: metaspeed
---
apiVersion: v1
kind: Secret
metadata:
  name: token-server-speed-secrets
  namespace: metaspeed
type: Opaque
stringData:
  # App
  BSV_NETWORK: "mainnet"
  WALLET_STORAGE_URL: "https://storage.babbage.systems"
  SERVER_PRIVATE_KEY: "REPLACE_WITH_YOUR_PRIVATE_KEY_HEX"

  # MongoDB
  MONGO_URI: "mongodb://metaspeed-mongo:27017"
  DATABASE_NAME: "MetaspeedTokenServer"

  # Optional collection overrides
  LEVELS_COLLECTION_NAME: "levels"
  ADMISSIONS_COLLECTION_NAME: "admissions"
  BALANCE_COLLECTION_NAME: "balance"
  TREASURY_COLLECTION_NAME: "treasury"
  PAYOUTS_COLLECTION_NAME: "payouts"
---
apiVersion: v1
kind: Service
metadata:
  name: metaspeed-mongo
  namespace: metaspeed
spec:
  selector:
    app: metaspeed-mongo
  ports:
    - name: mongo
      port: 27017
      targetPort: 27017
  type: ClusterIP
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: metaspeed-mongo
  namespace: metaspeed
spec:
  serviceName: metaspeed-mongo
  replicas: 1
  selector:
    matchLabels:
      app: metaspeed-mongo
  template:
    metadata:
      labels:
        app: metaspeed-mongo
    spec:
      containers:
        - name: mongo
          image: mongo:7
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: data
              mountPath: /data/db
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metaspeed-token-server
  namespace: metaspeed
spec:
  replicas: 1
  selector:
    matchLabels:
      app: metaspeed-token-server
  template:
    metadata:
      labels:
        app: metaspeed-token-server
    spec:
      containers:
        - name: token-server
          image: metaspeed-token-server:local
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3000"
          envFrom:
            - secretRef:
                name: token-server-speed-secrets
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: metaspeed-token-server
  namespace: metaspeed
spec:
  selector:
    app: metaspeed-token-server
  ports:
    - name: http
      port: 80
      targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: metaspeed-token-server-ing
  namespace: metaspeed
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  rules:
    - host: speed-token-server.metanet-games.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: metaspeed-token-server
                port:
                  number: 80
  tls:
    - hosts:
        - speed-token-server.metanet-games.com
      secretName: metaspeed-token-server-tls
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: metaspeed-token-server-tls
  namespace: metaspeed
spec:
  secretName: metaspeed-token-server-tls
  issuerRef:
    name: letsencrypt-nginx
    kind: ClusterIssuer
  dnsNames:
    - speed-token-server.metanet-games.com
YAML



# Apply
microk8s kubectl apply -f metaspeed-token-server.yaml


# Verify
microk8s kubectl -n metaspeed get pods
microk8s kubectl -n metaspeed logs deploy/metaspeed-token-server --tail=200
microk8s kubectl -n metaspeed run curltest --rm -it --image=curlimages/curl -- \
  curl -sS http://metaspeed-token-server/health

# External
curl -sS https://speed-token-server.metanet-games.com/health