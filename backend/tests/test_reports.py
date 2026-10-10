"""The report engines (F051, F052).

The F051 acceptance is four words — "Generated PDF parses" — and it is taken
literally: every PDF assertion here reads the bytes back **with pypdf**, which is
the same library the merge uses and therefore the same question a consumer asks.
A test that only measured the length of the output would pass on a file no
reader could open.

The Word half (F052) is read back with ``python-docx``, the library that wrote
its template, and the escaping test looks at the **body XML** rather than the
text: text alone cannot tell "escaped once" from "escaped twice and decoded
once".

Two properties get more attention than the rest, because they are the ones a
plausible implementation gets wrong: the PDF footer's page total is checked
against the pages actually drawn (a guessed total is a lie page one cannot
detect), and a table that spills is checked to carry its header onto the next
page.
"""

import io
import zipfile
from datetime import UTC, datetime

import pytest
from docx import Document as DocxDocument
from pypdf import DocumentInformation, PdfReader

from app.services import reports
from app.services.reports import PageLayout, ReportDocument, ReportSection, ReportTable


def parse(pdf: bytes) -> PdfReader:
    """The rendered bytes, read back the way a consumer reads them."""
    return PdfReader(io.BytesIO(pdf))


def text(reader: PdfReader, index: int = 0) -> str:
    return reader.pages[index].extract_text()


def information(reader: PdfReader) -> DocumentInformation:
    """The information dictionary, which the renderer always writes."""
    metadata = reader.metadata
    assert metadata is not None
    return metadata


def long_table(rows: int = 120) -> ReportTable:
    """Enough rows to leave a single page behind."""
    return ReportTable(
        columns=("Employee", "Role"),
        rows=[(f"Employee {number}", "Engineer") for number in range(rows)],
        heading="Assignments",
    )


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def test_a_rendered_report_parses() -> None:
    pdf = reports.render_report(
        ReportDocument(
            title="Manpower summary",
            subtitle="Awarded projects",
            metadata=(("Period", "2026-09"),),
            sections=(ReportSection("Notes", ("Read-only snapshot.",)),),
            tables=(ReportTable(columns=("Employee", "Role"), rows=(("Amina", "Engineer"),)),),
        )
    )

    assert pdf.startswith(b"%PDF-")
    body = text(parse(pdf))
    for expected in ("Manpower summary", "Awarded projects", "Period", "2026-09", "Amina"):
        assert expected in body


def test_the_document_carries_its_own_metadata() -> None:
    pdf = reports.render_report(
        ReportDocument(
            title="Manpower summary",
            author="Resource Manager",
            subject="September",
            keywords=("manpower", "september"),
        )
    )

    metadata = information(parse(pdf))
    assert metadata.title == "Manpower summary"
    assert metadata.author == "Resource Manager"
    assert metadata.subject == "September"
    assert metadata.creator == "resors"
    # The moment it was generated, so a file that leaves the service still says
    # when it did — and it is a real timestamp, not ReportLab's default.
    assert metadata.creation_date is not None


def test_the_footer_counts_the_pages_it_actually_drew() -> None:
    """The load-bearing one: "of N" is measured, never guessed."""
    reader = parse(reports.render_report(ReportDocument(title="Long", tables=(long_table(),))))

    total = len(reader.pages)
    assert total > 1
    assert f"Page 1 of {total}" in text(reader)
    assert f"Page {total} of {total}" in text(reader, total - 1)


def test_a_single_page_report_says_one_of_one() -> None:
    reader = parse(reports.render_report(ReportDocument(title="Short")))

    assert len(reader.pages) == 1
    assert "Page 1 of 1" in text(reader)


@pytest.mark.parametrize("layout", list(PageLayout))
def test_each_layout_is_the_geometry_it_names(layout: PageLayout) -> None:
    reader = parse(reports.render_report(ReportDocument(title="Sized", layout=layout)))

    box = reader.pages[0].mediabox
    width, height = layout.page_size
    assert float(box.width) == pytest.approx(width, abs=0.01)
    assert float(box.height) == pytest.approx(height, abs=0.01)


def test_a_landscape_page_is_wider_than_it_is_tall() -> None:
    """The property the tuple comparison above would not notice on its own."""
    reader = parse(
        reports.render_report(ReportDocument(title="Wide", layout=PageLayout.A3_LANDSCAPE))
    )

    box = reader.pages[0].mediabox
    assert box.width > box.height


def test_a_table_that_spills_repeats_its_header() -> None:
    reader = parse(reports.render_report(ReportDocument(title="Long", tables=(long_table(),))))

    assert len(reader.pages) > 1
    with_header = [page for page in reader.pages if "Role" in page.extract_text()]
    assert len(with_header) == len(reader.pages)


def test_a_value_is_printed_as_text_not_markup() -> None:
    """`&` and `<` are things a user typed, not instructions to the renderer."""
    reader = parse(
        reports.render_report(
            ReportDocument(
                title="R&D <night> shift",
                metadata=(("Period", "Q3 & Q4"),),
                tables=(ReportTable(columns=("Team",), rows=(("<b>bold</b>",),)),),
            )
        )
    )

    body = text(reader)
    assert "R&D <night> shift" in body
    assert "Q3 & Q4" in body
    assert "<b>bold</b>" in body


def test_a_long_title_is_shortened_in_the_footer_and_kept_in_the_body() -> None:
    """The footer is furniture: it yields to the page number, it does not collide."""
    title = "Awarded project manpower deployment forecast " * 4
    body = text(parse(reports.render_report(ReportDocument(title=title))))

    # The title block prints it — wrapped, so the first line proves the words.
    assert "Awarded project manpower deployment forecast" in body
    # The footer's copy is cut, and it is the line the page number follows.
    lines = body.splitlines()
    footer_title = lines[lines.index("Page 1 of 1") - 1]
    assert footer_title.endswith("...")
    assert len(footer_title) < len(title)


def test_a_ragged_row_is_refused_by_name() -> None:
    with pytest.raises(reports.ReportError, match="rectangular"):
        reports.render_report(
            ReportDocument(
                title="Ragged",
                tables=(ReportTable(columns=("A", "B"), rows=(("only one",),)),),
            )
        )


def test_a_table_without_columns_is_refused() -> None:
    with pytest.raises(reports.ReportError, match="at least one column"):
        reports.render_report(ReportDocument(title="Headless", tables=(ReportTable(columns=()),)))


# --------------------------------------------------------------------------
# Merging
# --------------------------------------------------------------------------


def test_merging_puts_the_parts_in_the_order_given() -> None:
    first = reports.render_report(ReportDocument(title="First part"))
    second = reports.render_report(ReportDocument(title="Second part"))

    merged = parse(reports.merge_pdfs([first, second]))

    assert len(merged.pages) == 2
    assert "First part" in text(merged, 0)
    assert "Second part" in text(merged, 1)


def test_merging_keeps_a_page_count_that_is_the_sum_of_its_parts() -> None:
    first = reports.render_report(ReportDocument(title="Long", tables=(long_table(),)))
    second = reports.render_report(ReportDocument(title="Also long", tables=(long_table(),)))

    merged = reports.merge_pdfs([first, second])

    assert reports.count_pages(merged) == reports.count_pages(first) + reports.count_pages(second)


def test_a_merged_bundle_is_named_when_the_caller_names_it() -> None:
    parts = [reports.render_report(ReportDocument(title="Part"))]

    assert information(parse(reports.merge_pdfs(parts, title="Bundle"))).title == "Bundle"
    assert information(parse(reports.merge_pdfs(parts))).title is None


def test_a_part_that_is_not_a_pdf_is_refused_and_named() -> None:
    good = reports.render_report(ReportDocument(title="Good"))

    with pytest.raises(reports.UnreadablePdf, match="part 2"):
        reports.merge_pdfs([good, b"this is not a PDF"])


def test_merging_nothing_is_refused() -> None:
    with pytest.raises(reports.EmptyMerge):
        reports.merge_pdfs([])


def test_count_pages_agrees_with_the_reader() -> None:
    pdf = reports.render_report(ReportDocument(title="Long", tables=(long_table(),)))

    assert reports.count_pages(pdf) == len(parse(pdf).pages)


def test_count_pages_refuses_what_it_cannot_read() -> None:
    with pytest.raises(reports.UnreadablePdf):
        reports.count_pages(b"")


def test_a_rendered_report_survives_the_merge_that_a_caller_will_do() -> None:
    """The BP-7.9b round trip in one test: render, merge, read back both."""
    report = reports.render_report(
        ReportDocument(title="User directory", tables=(long_table(rows=5),))
    )
    cover = reports.render_report(ReportDocument(title="Cover"))

    merged = parse(reports.merge_pdfs([cover, report], title="Export"))
    pages = len(merged.pages)

    assert information(merged).title == "Export"
    assert pages == reports.count_pages(cover) + reports.count_pages(report)
    assert "Cover" in text(merged, 0)
    assert "User directory" in text(merged, pages - 1)


# --------------------------------------------------------------------------
# Word documents (F052)
# --------------------------------------------------------------------------


def word_text(docx: bytes) -> str:
    """The rendered file's paragraph text, read back the way Word reads it."""
    return "\n".join(paragraph.text for paragraph in DocxDocument(io.BytesIO(docx)).paragraphs)


def word_xml(docx: bytes) -> str:
    """The body XML — the layer where escaping is or is not correct."""
    with zipfile.ZipFile(io.BytesIO(docx)) as archive:
        return archive.read("word/document.xml").decode("utf-8")


def test_a_rendered_docx_carries_the_document() -> None:
    docx = reports.render_docx(
        ReportDocument(
            title="Manpower summary",
            subtitle="Awarded projects",
            metadata=(("Period", "2026-09"),),
            sections=(ReportSection("Notes", ("Read-only snapshot.", "Second line.")),),
            author="Amina",
            generated_at=datetime(2026, 10, 10, 10, 17, tzinfo=UTC),
        )
    )

    assert docx.startswith(b"PK")  # an OOXML file is a zip
    body = word_text(docx)
    for expected in (
        "Manpower summary",
        "Awarded projects",
        "Period: 2026-09",
        "Notes",
        "Read-only snapshot.",
        "Second line.",
        "Amina · 2026-10-10 10:17 UTC",
    ):
        assert expected in body


def test_a_rendered_docx_carries_no_table() -> None:
    """The one thing the built-in template does not draw, stated rather than assumed.

    ``render_docx`` is the narrative half of BP-7.9b: a wide matrix is the PDF
    engine's job, and the docstring says so. This test exists so that changing
    the shipped template is a decision someone makes on purpose — the context
    carries the tables either way (``_docx_context``), so a caller's template
    can draw them without this module changing at all.
    """
    docx = reports.render_docx(
        ReportDocument(title="Users", tables=(ReportTable(("Name",), (("Amina",),)),))
    )

    assert "Amina" not in word_text(docx)


def test_a_subtitle_is_optional_in_a_docx() -> None:
    docx = reports.render_docx(ReportDocument(title="Untitled report"))

    assert "Untitled report" in word_text(docx)


def test_docx_values_are_escaped_exactly_once() -> None:
    """``&`` becomes ``&amp;`` in the XML and ``&`` to a reader — never both.

    The renderer hands docxtpl raw values and lets ``autoescape=True`` do the
    work; escaping here as well would print ``&amp;amp;`` to whoever opens the
    file. Both halves are asserted, because the round trip alone would pass on a
    template that escaped nothing and happened to render text that was never
    special.
    """
    awkward = 'R&D <night> "quotes"'
    docx = reports.render_docx(ReportDocument(title="Escaping", metadata=(("Fact", awkward),)))

    assert f"Fact: {awkward}" in word_text(docx)
    xml = word_xml(docx)
    assert "R&amp;D &lt;night&gt;" in xml
    assert "&amp;amp;" not in xml


def test_a_callers_template_sees_the_tables_the_default_does_not() -> None:
    """The seam a house template needs, exercised through a template.

    Every value a ``ReportDocument`` can hold reaches the context, so a caller
    that passes its own ``.docx`` is not bounded by the one that ships. The
    template is built here the way docxtpl requires — each ``{%p %}`` tag alone
    in its own paragraph — which is also why the shipped template is built with
    one tag per paragraph.
    """
    template = DocxDocument()
    for tag in (
        "{{ title }}",
        "{%p for table in tables %}",
        "{%p for column in table.columns %}",
        "{{ column }}",
        "{%p endfor %}",
        "{%p for row in table.rows %}",
        "{%p for cell in row %}",
        "{{ cell }}",
        "{%p endfor %}",
        "{%p endfor %}",
        "{%p endfor %}",
    ):
        template.add_paragraph(tag)
    buffer = io.BytesIO()
    template.save(buffer)

    docx = reports.render_docx(
        ReportDocument(
            title="Users",
            tables=(ReportTable(columns=("Name", "Role"), rows=(("Amina", "Engineer"),)),),
        ),
        template=buffer.getvalue(),
    )

    body = word_text(docx)
    assert "Users" in body
    assert "Name" in body
    assert "Amina" in body
    assert "Engineer" in body


def test_a_ragged_row_is_refused_by_the_docx_path_too() -> None:
    """A short row is refused, not quietly shortened in the Word file."""
    document = ReportDocument(
        title="Users",
        tables=(ReportTable(columns=("Name", "Role"), rows=(("Amina",),)),),
    )

    with pytest.raises(reports.ReportError):
        reports.render_docx(document)
