"""Apply completed independent content decisions to the reviewed English publication bank.

Usage: python3 scripts/apply-language-clue-review.py --bank RAW --english REPORT1 REPORT2 --output OUTPUT
Unreviewed candidates never publish. Keep the raw input and review reports as evidence.
"""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--bank',required=True);parser.add_argument('--output',required=True);parser.add_argument('--english',nargs='+',required=True);args=parser.parse_args()
bank=json.loads(Path(args.bank).read_text());by_answer={w['answer']:w for w in bank['words']}
approved=[];excluded=[];seen=set();reports=[]
for filename in args.english:
    source=Path(filename);report=json.loads(source.read_text());reports.append({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'reviewedEntries':len(report['entries'])})
    for row in report['entries']:
        answer=row['answer'];assert answer not in seen,answer;seen.add(answer)
        original=by_answer[answer];assert row.get('originalRead',row.get('read')) is True,answer
        assert row.get('originalClue',row.get('clue'))==original['clue'],answer
        decision=row.get('decision',row.get('verdict'))
        if decision in ['exclude','reject']:excluded.append(answer);continue
        assert decision in ['approve','accept','edit','rewrite'],decision
        clue=row.get('proposedClue',original['clue']);source_name=row.get('proposedClueSource',original['clueSource'])
        sense=row.get('proposedSenseKey',original.get('senseKey'));synset=row.get('proposedSynsetId',original.get('synsetId'))
        assert clue and source_name,answer
        if 'wordnet' in source_name.lower():assert sense and synset,answer
        approved.append({'answer':answer,'clue':clue,'clueSource':source_name,**({'senseKey':sense,'synsetId':synset}if sense else {}),**({'sourceLemma':row['proposedSourceLemma']}if row.get('proposedSourceLemma')else{})})
assert len(seen)==len(by_answer),(len(seen),len(by_answer));assert len(approved)>=2500,len(approved)
bank['metadata']['curation']={'reviewed':True,'sourceCandidates':len(by_answer),'approved':len(approved),'excluded':len(excluded),'inputSha256':hashlib.sha256(Path(args.bank).read_bytes()).hexdigest(),'reviews':reports}
bank['metadata']['selectionLicense']={'name': 'Creative Commons Attribution-ShareAlike 4.0 International', 'spdx': 'CC-BY-SA-4.0', 'url': 'https://creativecommons.org/licenses/by-sa/4.0/', 'attribution': 'wordfreq 3.1.1 by Robyn Speer', 'noticePath': 'data/lexicon/WORDFREQ-NOTICE.md'}
bank['metadata']['modifications']='Frequency based candidate selection, uppercase answers, independent review, US spelling and meaning selection, and edited short clues. WordNet license and full wordfreq notices retained.'
bank['words']=[{**row,'allowForPuzzle':True,'needsManualClue':False}for row in approved]
Path(args.output).write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'reviewed':len(seen),'approved':len(approved),'excluded':len(excluded)}))
