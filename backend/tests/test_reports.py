"""The PDF engine (F051).

The acceptance is four words — "Generated PDF parses" — and it is taken
literally: every assertion here reads the bytes back **with pypdf**, which is
the same library the merge uses and therefore the same question a consumer
asks. A test that only measured the length of the output would pass on a file
no reader could open.

Two properties get more attention than the rest, because they are the ones a
plausible implementation gets wrong: the footer's page total is checked against
the pages actually drawn (a guessed total is a lie page one cannot detect), and
a table that spills is checked to carry its header onto the next page.
"""

import io

import pytest
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
