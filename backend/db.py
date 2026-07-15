from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

print("========== DATABASE CONFIG ==========")
print("MONGO_URL:", os.getenv("MONGO_URL"))
print("DB_NAME:", os.getenv("DB_NAME"))
print("=====================================")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
