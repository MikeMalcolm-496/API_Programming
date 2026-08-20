from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, found_items, inquiries,messages,images

app = FastAPI(
    title="Lost & Found API",
    description="School Lost and Found platform API",
    version="1.0.0"
)

# CORS middleware must be added before any routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

app.include_router(auth.router)
app.include_router(found_items.router)
app.include_router(inquiries.router)
app.include_router(messages.router)
app.include_router(images.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Lost & Found API is running"}