import inspect
import ultralytics
from ultralytics import FastSAM

print("Ultralytics version:", ultralytics.__version__)
import ultralytics.models.fastsam as fs
print("FastSAM module contents:", dir(fs))

from ultralytics.models.fastsam.predict import FastSAMPredictor
print("FastSAMPredictor loaded successfully")
print("FastSAM is ready to use directly from ultralytics: FastSAM(model_path)")
