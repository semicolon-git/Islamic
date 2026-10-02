"""Shared configuration for the al-Qamus al-Muhit demo corpus.

Selected copies/pages come from the OpenITI `arabic_ms_data` repository
(https://github.com/OpenITI/arabic_ms_data, commit SOURCE_COMMIT), which holds page images
plus eScriptorium ALTO-4 exports (regions, line polygons/baselines, ground-truth text).

Paths can be overridden with environment variables:
  MS_SOURCE   checkout of OpenITI/arabic_ms_data   (default /home/user/datasets/arabic_ms_data)
  MS_WORK     scratch dir for line crops + OCR json (default /home/user/scratch/msprep/work)
  MS_OUT      output corpus dir                     (default: the folder above this scripts/ dir)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.environ.get('MS_SOURCE', '/home/user/datasets/arabic_ms_data')
WORK = os.environ.get('MS_WORK', '/home/user/scratch/msprep/work')
OUT = os.environ.get('MS_OUT', os.path.dirname(HERE))
QURAN_MATCHER = os.environ.get('MS_QURAN_MATCHER', '/home/user/Islamic/prep/scripts')

SOURCE_REPO = 'https://github.com/OpenITI/arabic_ms_data'
SOURCE_COMMIT = 'c131f89270ca373eb8899e37decb9fd131e57e41'
WORK_DIR = 'firuzabadi_al_qamus_al_muhit'

WEB_LONG_SIDE = 2000
THUMB_LONG_SIDE = 400
JPEG_QUALITY = 82

# ALTO <OtherTag LABEL> -> our region type
REGION_TYPE = {
    'Main': 'main',
    'Marginal Material': 'margin',
    'Title': 'title',
    'Catchword': 'catchword',
    'Interlinear': 'other',
}

WORK_COMMON = {
    'title_ar': 'القاموس المحيط والقابوس الوسيط',
    'title_en': 'al-Qāmūs al-muḥīṭ wa-l-qābūs al-wasīṭ (The Encompassing Ocean), Arabic lexicon',
    'author_ar': 'مجد الدين محمد بن يعقوب الفيروزآبادي (ت. 817هـ)',
    'author_en': 'Majd al-Dīn Muḥammad b. Yaʿqūb al-Fīrūzābādī (d. 817/1415)',
}

_BNF = 'bibliotheque_nationale_de_france_departement_des_manuscrits_arabe_5341/' \
       'bibliotheque_nationale_de_france_departement_des_manuscrits_arabe_5341.pdf_page_{}'
_UM22 = 'university_of_michigan_isl_ms_22/university_of_michigan_isl_ms_221.pdf_page_{}'

MANUSCRIPTS = [
    {
        'id': 'umich-isl-22',
        'holding_library': 'University of Michigan Library, Special Collections Research Center (Ann Arbor)',
        'holding_library_ar': 'مكتبة جامعة ميشيغان، آن آربر',
        'shelfmark': 'Isl. Ms. 22',
        'copy_date': None,
        'copy_date_note': 'Not verified: the U-M / HathiTrust catalogue record could not be reached from this '
                          'environment. Fill in from the catalogue before publication.',
        'script_description': 'Fully vocalised naskh in black ink, red rubrics (headwords / abbreviation marks), '
                              'ruled gold-and-black frame; page 1 has an illuminated headpiece band '
                              '"باب الهمزة فصل الألف". Clean, regular hand - the "easy" copy.',
        'licence': 'Public Domain (HathiTrust rights code "pd"). The scan itself carries the HathiTrust stamp '
                   '"Public Domain / http://www.hathitrust.org/access_use#pd" and handle mdp.39015079126200.',
        'licence_confidence': 'high',
        'licence_note': 'Rights statement read from the HathiTrust download stamp printed in the left margin of every '
                        'page image ("Generated on 2022-03-10 ... https://hdl.handle.net/2027/mdp.39015079126200 / '
                        'Public Domain"). U-M asks for attribution and likes the curator of Islamic manuscripts to be '
                        'told about reproductions (Islamic Manuscripts guide, Citation & Permissions). The stamp and '
                        'the "Digitized by / Original from University of Michigan" footer are part of the image; '
                        'crop them in the UI if desired, do not remove the credit.',
        'credit_line': 'Isl. Ms. 22, University of Michigan Library (Special Collections Research Center), Ann Arbor - '
                       'digitized by the University of Michigan, via HathiTrust (public domain). Layout + transcription: '
                       'OpenITI arabic_ms_data.',
        'source_url': 'https://hdl.handle.net/2027/mdp.39015079126200',
        'catalogue_url': 'https://babel.hathitrust.org/cgi/pt?id=mdp.39015079126200',
        'iiif': None,
        'pages': [
            {'src': _UM22.format(1), 'img_ext': 'png', 'label': 'End of preface; illuminated heading باب الهمزة; entries آء … بكأ'},
            {'src': _UM22.format(2), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries بكأ (cont.) … (incl. بوأ, جزأ)'},
            {'src': _UM22.format(3), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries جشأ … حلأ'},
        ],
    },
    {
        'id': 'sbb-or-fol-215',
        'holding_library': 'Staatsbibliothek zu Berlin - Preußischer Kulturbesitz, Orientabteilung',
        'holding_library_ar': 'مكتبة الدولة في برلين',
        'shelfmark': 'Ms. or. fol. 215 (Ahlwardt 6973)',
        'copy_date': None,
        'copy_date_note': 'Not verified (Qalamos record DE1Book_manuscript_00002352 unreachable from this environment).',
        'script_description': 'Fully vocalised naskh, red rubrics and red section heads (فصل ...), double-ruled frame, '
                              'many marginal glosses written obliquely (marginal regions are annotated but NOT '
                              'transcribed in the source data - good "help us transcribe" targets).',
        'licence': 'Public Domain Mark 1.0 (SBB digitised collections / "Orientalische Handschriften digital").',
        'licence_confidence': 'medium',
        'licence_note': 'SBB marks its digitised out-of-copyright oriental manuscripts with PDM 1.0 (as shown on their '
                        'Deutsche Digitale Bibliothek records). Item-level statement for this shelfmark not checked '
                        '(digital.staatsbibliothek-berlin.de unreachable); older SBB scans carried CC BY-NC-SA 3.0 DE.',
        'credit_line': 'Staatsbibliothek zu Berlin - Preußischer Kulturbesitz, Orientabteilung, Ms. or. fol. 215 '
                       '(Public Domain Mark 1.0). Layout + transcription: OpenITI arabic_ms_data.',
        'source_url': 'https://digital.staatsbibliothek-berlin.de/',
        'catalogue_url': 'https://qalamos.net/receive/DE1Book_manuscript_00002352',
        'iiif': None,
        'pages': [
            {'src': 'sbzb_ms_or_fol_215/00000016', 'img_ext': 'tif', 'label': 'Bāb al-hamza, entries ألاء … بوأ; oblique marginal glosses'},
            {'src': 'sbzb_ms_or_fol_215/00000017', 'img_ext': 'tif', 'label': 'Bāb al-hamza, entries بوأ (cont.) … بدأ'},
            {'src': 'sbzb_ms_or_fol_215/00000018', 'img_ext': 'tif', 'label': 'Bāb al-hamza, entries جبأ (cont.) … (incl. جزأ)'},
        ],
    },
    {
        'id': 'bnf-arabe-5341',
        'holding_library': 'Bibliothèque nationale de France, Département des Manuscrits',
        'holding_library_ar': 'المكتبة الوطنية الفرنسية، قسم المخطوطات',
        'shelfmark': 'Arabe 5341',
        'copy_date': None,
        'copy_date_note': 'Not verified (Gallica / BnF Archives et manuscrits unreachable from this environment).',
        'script_description': 'Unvocalised, cursive and crowded naskh-type hand; grayscale (microfilm-derived) scan; '
                              'large bold section heads (فصل ...), interlinear and marginal notes. The "hard" copy.',
        'licence': 'Gallica terms: free NON-COMMERCIAL reuse with the credit "Source gallica.bnf.fr / BnF"; '
                   'commercial reuse requires a paid BnF licence.',
        'licence_confidence': 'high (for the general Gallica terms); item not individually checked',
        'licence_note': 'If the platform is or becomes commercial, either obtain a BnF licence or swap this copy '
                        'for a public-domain one (e.g. Penn LJS 387 on OPenn, or SBB Glaser 33 which overlaps the '
                        'same entries).',
        'credit_line': 'Source gallica.bnf.fr / Bibliothèque nationale de France, Département des Manuscrits, Arabe 5341. '
                       'Layout + transcription: OpenITI arabic_ms_data.',
        'source_url': 'https://gallica.bnf.fr/',
        'catalogue_url': 'https://archivesetmanuscrits.bnf.fr/  (search: "Arabe 5341")',
        'iiif': None,
        'pages': [
            {'src': _BNF.format(3), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries بأبأ … بطأ'},
            {'src': _BNF.format(4), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries بطأ (cont.) … بوأ'},
            {'src': _BNF.format(5), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries ثطأ … (incl. جزأ)'},
            {'src': _BNF.format(7), 'img_ext': 'png', 'label': 'Bāb al-hamza, entries حتأ … حلأ; marginal notes'},
        ],
    },
]
