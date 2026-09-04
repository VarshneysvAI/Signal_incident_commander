import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.models import Incident


@pytest.fixture(scope="function")
def test_db():
    """Create an in-memory database for testing."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db, engine
    finally:
        db.close()


@pytest.fixture(scope="function")
def test_incident(test_db):
    """Create a test incident."""
    db, engine = test_db
    
    incident = Incident(
        id="test-incident",
        title="Test Incident",
        status="active",
        channel_name="test-channel"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    
    return incident
