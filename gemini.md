# Build and Deploy Instructions

When asked to build and deploy a productionized version of this application, you MUST strictly follow the instructions outlined below. 

**CRITICAL RULE: DO NOT MODIFY THE CODE AT ALL WHEN BUILDING OR DEPLOYING THE APPLICATION. ONLY FOLLOW THESE INSTRUCTIONS.**

## 1. Frontend Build (React + Vite)
The frontend must be compiled into a static production bundle.
Run the following commands in the root of the project:
```bash
npm install
npm run build
```
This will output the optimized, minified static files into the `dist/` directory.

## 2. Backend Execution (Python + FastAPI)
The backend is a FastAPI application that maintains critical **in-memory state** (WebSocket registries, active pollers, latest payloads). Because of this, it MUST be run with a **single worker**. Running multiple workers will cause fragmented state and missing broadcasts.

In production, run using an ASGI server like `uvicorn`:
```bash
# If using a virtual environment:
# source venv/bin/activate 

uvicorn server:app --host 0.0.0.0 --port 8001
```

## 3. Web Server & Proxy (Environment Dependent)
- **If deploying to a PaaS/Platform (e.g. Render, Replit, Heroku):** The platform's proxy will route to the port assigned (8001). Configure the platform to run the backend as a standard web service, ideally on a persistent VM or instance type that does not scale to zero (due to long-lived WebSockets). Serve the frontend static files as a separate static site or via the backend.
- **If deploying to a bare-metal VPS:** Serve the static frontend assets from the `dist/` directory using a web server such as Nginx. Configure Nginx to reverse proxy any requests starting with `/api/` and `/ws/` to the backend running on port 8001.

You must not alter the source code to accommodate these deployment steps (e.g., do not attempt to add Redis for pub/sub). Rely strictly on infrastructure, reverse proxies, and the commands provided.
