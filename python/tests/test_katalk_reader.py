"""
Tests for katalk_reader.py.

These tests exercise only the pure-data logic (Message serialisation,
message hashing, and chat-line parsing) so they run without pywinauto.
"""

import json
import sys
import os

# Ensure the python package root is on sys.path so we can import katalk_reader
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from katalk_reader import KatalkReader, Message


class TestMessageToJson:
    """Message dataclass serialises correctly."""

    def test_text_message_to_json(self):
        msg = Message(
            room_name="강남물류방",
            sender="화주김",
            content="역삼동에서 해운대 박스3개 35만",
            content_type="text",
        )
        result = json.loads(msg.to_json())
        assert result["room_name"] == "강남물류방"
        assert result["sender"] == "화주김"
        assert result["content"] == "역삼동에서 해운대 박스3개 35만"
        assert result["content_type"] == "text"
        assert result["image_path"] is None

    def test_image_message_to_json(self):
        msg = Message(
            room_name="부산화물방",
            sender="기사박",
            content="image",
            content_type="image",
            image_path="C:/temp/photo.jpg",
        )
        result = json.loads(msg.to_json())
        assert result["content_type"] == "image"
        assert result["image_path"] == "C:/temp/photo.jpg"

    def test_to_json_returns_string(self):
        msg = Message(
            room_name="테스트방",
            sender="홍길동",
            content="테스트",
            content_type="text",
        )
        assert isinstance(msg.to_json(), str)


class TestDetectNewMessages:
    """Hash comparison detects new vs. same messages."""

    def test_same_messages_produce_same_hash(self):
        lines = ["[화주김] [오후 2:30] 메시지1", "[기사박] [오후 2:31] 메시지2"]
        hash_a = KatalkReader._get_message_hash(lines)
        hash_b = KatalkReader._get_message_hash(lines)
        assert hash_a == hash_b

    def test_different_messages_produce_different_hash(self):
        lines_a = ["[화주김] [오후 2:30] 메시지1"]
        lines_b = ["[화주김] [오후 2:30] 메시지2"]
        assert KatalkReader._get_message_hash(lines_a) != KatalkReader._get_message_hash(lines_b)

    def test_is_new_message_first_time(self):
        reader = KatalkReader()
        assert reader._is_new_message("방1", "abc123") is True

    def test_is_new_message_same_hash(self):
        reader = KatalkReader()
        reader._is_new_message("방1", "abc123")
        assert reader._is_new_message("방1", "abc123") is False

    def test_is_new_message_changed_hash(self):
        reader = KatalkReader()
        reader._is_new_message("방1", "abc123")
        assert reader._is_new_message("방1", "def456") is True

    def test_hash_uses_last_five(self):
        """Only the last 5 messages are used for hashing."""
        lines_6 = ["msg1", "msg2", "msg3", "msg4", "msg5", "msg6"]
        lines_5_tail = ["msg2", "msg3", "msg4", "msg5", "msg6"]
        assert KatalkReader._get_message_hash(lines_6) == KatalkReader._get_message_hash(lines_5_tail)

    def test_hash_empty_list(self):
        """Hashing an empty list should not raise."""
        h = KatalkReader._get_message_hash([])
        assert isinstance(h, str) and len(h) == 32


class TestParseChatText:
    """Parse the [sender] [time] content format."""

    def test_standard_format(self):
        line = "[화주김] [오후 2:30] 역삼동에서 해운대 박스3개 35만"
        result = KatalkReader._parse_chat_line(line)
        assert result is not None
        assert result["sender"] == "화주김"
        assert result["time"] == "오후 2:30"
        assert result["content"] == "역삼동에서 해운대 박스3개 35만"

    def test_morning_time(self):
        line = "[관리자] [오전 9:00] 안녕하세요"
        result = KatalkReader._parse_chat_line(line)
        assert result is not None
        assert result["sender"] == "관리자"
        assert result["time"] == "오전 9:00"
        assert result["content"] == "안녕하세요"

    def test_content_with_brackets(self):
        line = "[기사박] [오후 1:15] [긴급] 화물 도착"
        result = KatalkReader._parse_chat_line(line)
        assert result is not None
        assert result["sender"] == "기사박"
        assert result["content"] == "[긴급] 화물 도착"

    def test_non_matching_line_returns_none(self):
        line = "--- 2026년 3월 6일 금요일 ---"
        result = KatalkReader._parse_chat_line(line)
        assert result is None

    def test_empty_line_returns_none(self):
        result = KatalkReader._parse_chat_line("")
        assert result is None

    def test_whitespace_trimmed(self):
        line = "  [화주김] [오후 2:30] 테스트 메시지  "
        result = KatalkReader._parse_chat_line(line)
        assert result is not None
        assert result["sender"] == "화주김"
