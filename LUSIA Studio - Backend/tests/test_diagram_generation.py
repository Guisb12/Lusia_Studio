import unittest

from app.api.http.services.diagram_parser import DiagramParserError, DiagramStreamParser


class DiagramStreamParserTests(unittest.TestCase):
    def make_parser(self) -> DiagramStreamParser:
        return DiagramStreamParser(
            diagram_type="mindmap",
            title="Teste",
            generation_params={"prompt": "tema"},
        )

    def test_accepts_complete_node_lines(self):
        parser = self.make_parser()

        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')
        events = parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo curto.","kind":"concept","relation":null,"order":0}}\n'
        )

        self.assertEqual([event["type"] for event in events], ["node_added", "node_committed"])
        final = parser.finalize()
        self.assertEqual(len(final["nodes"]), 1)
        self.assertEqual(final["nodes"][0]["id"], "root")

    def test_handles_partial_chunk_boundaries(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        first = parser.feed('{"type":"node","node":{"id":"roo')
        second = parser.feed('t","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"concept","relation":null,"order":0}}\n')

        self.assertEqual(first, [])
        self.assertEqual([event["type"] for event in second], ["node_added", "node_committed"])

    def test_duplicate_id_is_fatal(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')
        parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"concept","relation":null,"order":0}}\n'
        )

        with self.assertRaises(DiagramParserError):
            parser.feed(
                '{"type":"node","node":{"id":"root","parent_id":null,"label":"Outro","summary":"Resumo.","kind":"concept","relation":null,"order":1}}\n'
            )

    def test_invalid_kind_is_coerced_to_concept(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"invented","relation":null,"order":0}}\n'
        )
        final = parser.finalize()

        self.assertEqual(final["nodes"][0]["kind"], "concept")
        self.assertEqual(final["stats"]["coerced_kinds"], 1)

    def test_missing_relation_normalizes_to_null(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"concept","order":0}}\n'
        )
        final = parser.finalize()

        self.assertIsNone(final["nodes"][0]["relation"])

    def test_unresolved_parent_is_buffered_then_resolved(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        first = parser.feed(
            '{"type":"node","node":{"id":"child","parent_id":"root","label":"Filho","summary":"Resumo.","kind":"concept","relation":"explica","order":0}}\n'
        )
        second = parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"concept","relation":null,"order":0}}\n'
        )

        self.assertEqual(first, [])
        self.assertEqual([event["type"] for event in second], ["node_added", "node_committed", "node_added", "node_committed"])
        final = parser.finalize()
        self.assertEqual([node["id"] for node in final["nodes"]], ["root", "child"])

    def test_unresolved_parent_is_dropped_at_finalize(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        parser.feed(
            '{"type":"node","node":{"id":"child","parent_id":"missing","label":"Filho","summary":"Resumo.","kind":"concept","relation":"explica","order":0}}\n'
        )

        with self.assertRaises(DiagramParserError):
            parser.finalize()

    def test_detects_cycle(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')

        parser.feed(
            '{"type":"node","node":{"id":"a","parent_id":"b","label":"A","summary":"Resumo A.","kind":"concept","relation":null,"order":0}}\n'
        )
        parser.feed(
            '{"type":"node","node":{"id":"b","parent_id":"a","label":"B","summary":"Resumo B.","kind":"concept","relation":null,"order":1}}\n'
        )

        with self.assertRaises(DiagramParserError):
            parser.finalize()

    def test_siblings_are_sorted_by_order(self):
        parser = self.make_parser()
        parser.feed('{"type":"meta","title":"Mapa","diagram_type":"mindmap"}\n')
        parser.feed(
            '{"type":"node","node":{"id":"root","parent_id":null,"label":"Tema","summary":"Resumo.","kind":"concept","relation":null,"order":0}}\n'
        )
        parser.feed(
            '{"type":"node","node":{"id":"b","parent_id":"root","label":"B","summary":"Resumo B.","kind":"example","relation":null,"order":2}}\n'
        )
        parser.feed(
            '{"type":"node","node":{"id":"a","parent_id":"root","label":"A","summary":"Resumo A.","kind":"concept","relation":null,"order":1}}\n'
        )

        final = parser.finalize()
        children = [node["id"] for node in final["nodes"] if node["parent_id"] == "root"]
        self.assertEqual(children, ["a", "b"])

    def test_meta_updates_title_and_type(self):
        parser = self.make_parser()
        events = parser.feed('{"type":"meta","title":"Linha do Tempo","diagram_type":"sequence"}\n')

        self.assertEqual(events[0]["type"], "diagram_updated")
        self.assertEqual(parser.title, "Linha do Tempo")
        self.assertEqual(parser.diagram_type, "sequence")


if __name__ == "__main__":
    unittest.main()
