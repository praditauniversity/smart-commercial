from abc import ABC, abstractmethod
from typing import List, Optional
from schemas import DetectionSchema, ClassDef, ModelConfigPayload

class BaseVisionProvider(ABC):
    def __init__(self, config: ModelConfigPayload):
        self.config = config

    @abstractmethod
    async def detect(
        self,
        image_base64: str,
        active_classes: List[ClassDef],
        timestamp_seconds: Optional[float] = None,
        frame_index: Optional[int] = None
    ) -> DetectionSchema:
        """
        Executes vision-language object detection on image_base64 given active_classes
        and returns normalized DetectionSchema.
        """
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """
        Verifies provider connectivity and credentials.
        """
        pass
