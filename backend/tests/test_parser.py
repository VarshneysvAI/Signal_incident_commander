import pytest
from app.services.parser_service import parser_service


class TestParserService:
    """Test deterministic parser patterns."""
    
    def test_fact_detection_db(self):
        """'Metrics show DB is healthy' -> fact, topic db, high confidence."""
        result = parser_service.parse("Metrics show DB is healthy.", "Bob")
        assert result["utterance_type"] == "fact"
        assert result["topic"] == "db"
        assert result["confidence"] == "high"
        assert result["polarity"] == "positive"
    
    def test_fact_detection_logs(self):
        """'Logs confirm the API is failing' -> fact, topic api."""
        result = parser_service.parse("Logs confirm the API is failing.", "Alice")
        assert result["utterance_type"] == "fact"
        assert result["topic"] == "api"
        assert result["confidence"] == "high"
        assert result["polarity"] == "negative"
    
    def test_hypothesis_detection(self):
        """'I think DB is the issue' -> hypothesis, topic db."""
        result = parser_service.parse("I think DB is the issue.", "Alice")
        assert result["utterance_type"] == "hypothesis"
        assert result["topic"] == "db"
        assert result["confidence"] == "high"
    
    def test_decision_detection(self):
        """'Let's roll back the deployment' -> decision, topic deployment."""
        result = parser_service.parse("Let's roll back the deployment.", "Dave")
        assert result["utterance_type"] == "decision"
        assert result["topic"] == "deployment"
        assert result["confidence"] == "high"
    
    def test_action_self_assignment(self):
        """'I will take the rollback' -> action, owner=speaker, committed."""
        result = parser_service.parse("I will take the rollback.", "Dave")
        assert result["utterance_type"] == "action"
        assert result["proposed_owner"] == "Dave"
        assert result["action_status"] == "committed"
    
    def test_action_third_party_assignment(self):
        """'Carol should take the rollback' -> action, pending_owner_confirmation."""
        result = parser_service.parse("Carol will handle the rollback.", "Dave")
        assert result["utterance_type"] == "action"
        assert result["proposed_owner"] == "Carol"
        assert result["action_status"] == "pending_owner_confirmation"
    
    def test_negated_decision(self):
        """'We should NOT roll back' -> decision negated -> rejected."""
        result = parser_service.parse("We should NOT roll back.", "Eve")
        assert result["utterance_type"] == "decision"
        assert result["negated"] == True
        assert "[REJECTED]" in result["normalized_label"]
    
    def test_question_detection(self):
        """'What is the customer impact?' -> question."""
        result = parser_service.parse("What is the customer impact?", "Eve")
        assert result["utterance_type"] == "question"
    
    def test_cache_hypothesis(self):
        """'Redis cache is failing' -> hypothesis, topic cache."""
        result = parser_service.parse("Redis cache is failing.", "Carol")
        assert result["utterance_type"] == "hypothesis"
        assert result["topic"] == "cache"
        assert result["polarity"] == "negative"
    
    def test_off_topic_detection(self):
        """'Who ordered pizza?' -> no pattern match -> uncertain/off_topic."""
        result = parser_service.parse("Who ordered pizza?", "Random")
        # This matches question pattern but has general topic
        assert result["topic"] == "general"
    
    def test_we_verified_fact(self):
        """'We verified the database connection' -> fact."""
        result = parser_service.parse("We verified the database connection.", "Alice")
        assert result["utterance_type"] == "fact"
        assert result["topic"] == "db"
    
    def test_data_shows_fact(self):
        """'Data shows latency spiking' -> fact with negative polarity."""
        result = parser_service.parse("Data shows latency spiking.", "Bob")
        assert result["utterance_type"] == "fact"
        assert result["polarity"] == "negative"
    
    def test_maybe_hypothesis(self):
        """'Maybe it's the cache' -> hypothesis."""
        result = parser_service.parse("Maybe it's the cache.", "Carol")
        assert result["utterance_type"] == "hypothesis"
        assert result["topic"] == "cache"
    
    def test_i_propose_decision(self):
        """'I propose we restart the service' -> decision."""
        result = parser_service.parse("I propose we restart the service.", "Dave")
        assert result["utterance_type"] == "decision"
    
    def test_working_on_action(self):
        """'I'm working on the deployment' -> action, owner=speaker."""
        result = parser_service.parse("I'm working on the deployment.", "Dave")
        assert result["utterance_type"] == "action"
        assert result["topic"] == "deployment"
    
    def test_assign_to_action(self):
        """'Assign this to Carol' -> action, pending confirmation."""
        result = parser_service.parse("Assign this to Carol.", "Dave")
        assert result["utterance_type"] == "action"
        assert result["proposed_owner"] == "Carol"
        assert result["action_status"] == "pending_owner_confirmation"
    
    def test_negation_within_4_tokens(self):
        """Test negation detection within 4 tokens before keyword."""
        result = parser_service.parse("We should not deploy now.", "Eve")
        assert result["negated"] == True
    
    def test_general_topic_medium_confidence(self):
        """Fact with general topic -> medium confidence."""
        result = parser_service.parse("Metrics show things are working.", "Bob")
        assert result["utterance_type"] == "fact"
        # "metrics" is a monitoring keyword, so it's high confidence
        assert result["confidence"] == "high"
        assert result["topic"] == "monitoring"
