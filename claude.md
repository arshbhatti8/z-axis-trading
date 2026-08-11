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
The backend is a FastAPI application. In development, it may have been run using `python server.py`, but in production, it should be run using a production-grade ASGI server like `uvicorn` with multiple workers.
Run the following commands in the root of the project:
```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4
```

## 3. Web Server & Reverse Proxy
To deploy the application fully:
- Serve the static frontend assets from the `dist/` directory using a web server such as Nginx or Apache.
- Configure a reverse proxy to route any requests starting with `/api/` and `/ws/` to the backend running on port 8001.

You must not alter the source code to accommodate these deployment steps. Rely strictly on infrastructure, reverse proxies, and the commands provided.
