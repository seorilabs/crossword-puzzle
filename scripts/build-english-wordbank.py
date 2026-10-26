"""Build a reproducible US English candidate bank from WordNet 3.0.
Usage: python3 scripts/build-english-wordbank.py /path/WordNet-3.0.tar.gz OUTPUT.json
The source archive is https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz.
"""
import hashlib,json,re,sys,tarfile
from wordfreq import zipf_frequency
from pathlib import Path
source=Path(sys.argv[1]); output=Path(sys.argv[2]); archive=tarfile.open(source)
root=Path(__file__).resolve().parents[1]; senses={}
for pos in ['noun','verb','adj','adv']:
    for line in archive.extractfile('WordNet-3.0/dict/data.'+pos).read().decode().splitlines():
        if not re.match(r'^\d',line): continue
        data,gloss=line.split('|',1); fields=data.split()
        senses[(pos,fields[0])]=(fields[4:4+2*int(fields[3],16):2],gloss.split(';')[0].strip())
# Exclude British variants, unsuitable topics and domain-specific definitions.
blocked=set('thyroid theorem naive pyrex iliad gauss watt volt amp ohm ms mr dr mg gm mc ml cm mm dc yr bw ma pa ca pc pm am ad em en ab ae ai ar ax ay ba bi bo da de di ed ef eh el er es et ex fa fe gi ha hm ho id jo ka ki la li lo mi mo mu na ne nu od oe oi om op os ou ow ox oy pe pi po qi re sh si ta te ti uh um un ut xu ya ye za arse ass bastard bitch bloody breast cannabis cock cocaine crap cunt damn dick drug fuck gay heroin kill marijuana murder nazi penis porn rape sex shit suicide tobacco vagina weed whore colour honour favour labour centre theatre metre litre grey aeroplane aluminium cheque tyre petrol mum maths'.split())
exclude=re.compile(r'\b(British|Britain|England|Scotland|slang|vulgar|offensive|obscene|sexual|genital|excrement|narcotic|anatomy|botany|zoology|chemistry|physics|mathematics|archaic|obsolete)\b',re.I)
candidates=[]
for line in archive.extractfile('WordNet-3.0/dict/index.sense').read().decode().splitlines():
    key,offset,sense,count=line.split();word=key.split('%')[0]
    if not re.fullmatch('[a-z]{2,8}',word) or word in blocked :continue
    pos={'1':'noun','2':'verb','3':'adj','4':'adv','5':'adj'}[key.split('%')[1][0]]
    lemmas,gloss=senses[(pos,offset)]
    if any(lemma.lower()==word and lemma!=word for lemma in lemmas):continue
    if zipf_frequency(word,'en') < 3.7:continue
    if not 8<=len(gloss)<=90 or exclude.search(gloss) or re.search(r'\b'+word+r'\b',gloss,re.I):continue
    candidates.append((int(count),word,key,pos,offset,gloss))
words={}
for count,word,key,pos,offset,gloss in sorted(candidates,key=lambda r:(zipf_frequency(r[1],'en'),r[0]),reverse=True):
    if word.upper() in words:continue
    words[word.upper()]={'answer':word.upper(),'clue':gloss[0].upper()+gloss[1:],'clueSource':'Princeton WordNet 3.0','senseKey':key,'synsetId':f'{pos}-{offset}','tagCount':count,'allowForPuzzle':True,'needsManualClue':False}
    if len(words)==3500:break
if len(words)<2500:raise RuntimeError('Not enough eligible candidates')
license=archive.extractfile('WordNet-3.0/LICENSE').read().decode()
(root/'data/lexicon/WORDNET-LICENSE.txt').write_text(license)
metadata={'frequencySource':'wordfreq 3.1.1 by Robyn Speer, CC BY-SA 4.0, https://github.com/rspeer/wordfreq', 'language':'en','sourceName':'Princeton WordNet 3.0','sourceUrl':'https://wordnet.princeton.edu/','archiveUrl':'https://wordnetcode.princeton.edu/3.0/WordNet-3.0.tar.gz','archiveSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'license':{'name':'WordNet 3.0','spdx':'WordNet','url':'https://wordnet.princeton.edu/license-and-commercial-use'},'selection':'3500 common wordfreq 3.1.1 candidates with Zipf >=3.7, A-Z 2-8, WordNet short gloss, proper-name, topic and US variant exclusions. Frequency is a familiarity signal; final puzzle clues require review.'}
output.write_text(json.dumps({'metadata':metadata,'words':list(words.values())},ensure_ascii=False,indent=2)+'\n')
print(f'{len(words)} English candidates')
