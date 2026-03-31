import os
import cv2
import numpy as np
import base64
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI()

# Allow CORS so the React app running on localhost:5173 can call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the PyTorch YOLO model at startup
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'licence_plate.pt')

try:
    print(f"Loading license plate model from {MODEL_PATH}...")
    model = YOLO(MODEL_PATH)
    print("Model loaded successfully!")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None


@app.post("/detect-plate")
async def detect_plate(file: UploadFile = File(...)):
    """
    Receives an image of a car, runs it through the license_plate.pt model,
    and returns a cropped base64 image of the detected plate if found.
    """
    if model is None:
        return {"error": "Model failed to load on server start."}

    try:
        # Read the uploaded image bytes
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Invalid image received"}

        # Run YOLO inference
        results = model(img)
        
        # Analyze results
        result = results[0] # Assume batch size 1
        boxes = result.boxes
        
        if len(boxes) == 0:
            return {"found": False}
        
        # Get the bounding box with the highest confidence
        best_box = None
        best_conf = -1
        
        for box in boxes:
            conf = float(box.conf[0])
            if conf > best_conf:
                best_conf = conf
                best_box = box
                
        if best_box is None:
            return {"found": False}
            
        # Extract precise int coordinates for cropping
        x1, y1, x2, y2 = map(int, best_box.xyxy[0].tolist())
        
        # Add a slight 5% padding around the plate so it looks nice visually
        h, w = img.shape[:2]
        pad_x = int((x2 - x1) * 0.05)
        pad_y = int((y2 - y1) * 0.05)
        
        px1 = max(0, x1 - pad_x)
        py1 = max(0, y1 - pad_y)
        px2 = min(w, x2 + pad_x)
        py2 = min(h, y2 + pad_y)
        
        # Crop the plate
        plate_crop = img[py1:py2, px1:px2]
        
        # Encode cropped plate to base64 for easy React rendering
        _, buffer = cv2.imencode('.jpg', plate_crop)
        plate_b64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "found": True,
            "confidence": best_conf,
            "bbox": [x1, y1, x2, y2],
            "image_b64": f"data:image/jpeg;base64,{plate_b64}"
        }
        
    except Exception as e:
        print(f"Error during inference: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
