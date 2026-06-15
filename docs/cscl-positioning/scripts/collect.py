import requests, json, time, sys
M = {'mailto':'jewoong.moon@gmail.com'}
SEL = "id,display_name,publication_year,cited_by_count,referenced_works,authorships,primary_location,concepts,type"
OUT = ".assets/research/corpus.jsonl"

def page(filt=None, search=None, sort=None, cap=10000, label=""):
    got, cursor = [], "*"
    while len(got) < cap:
        p = dict(M); p.update({'per-page':200,'cursor':cursor,'select':SEL})
        if filt: p['filter']=filt
        if search: p['search']=search
        if sort: p['sort']=sort
        r = requests.get('https://api.openalex.org/works',params=p,timeout=60)
        if r.status_code!=200:
            print("  ! HTTP",r.status_code,r.text[:120]); break
        j=r.json(); got+=j['results']
        cursor=j['meta'].get('next_cursor')
        if not cursor or not j['results']: break
        time.sleep(0.15)
    print(f"  [{label}] pulled {len(got[:cap])}")
    return got[:cap]

sets = []
# A: ijCSCL flagship — entire journal
sets += page(filt="primary_location.source.id:S64184962", label="ijCSCL", cap=600)
# B: CSCL concept — top cited
sets += page(filt="concepts.id:C2778515922", sort="cited_by_count:desc", cap=700, label="CSCL-concept")
# C: Knowledge Building concept — top cited
sets += page(filt="concepts.id:C2778484570", sort="cited_by_count:desc", cap=450, label="KB-concept")
# D: method anchors via title search
for q,c in [("epistemic network analysis",250),("knowledge forum",200),("KBDeX knowledge building discourse explorer",120),("knowledge building community",200),("group cognition collaborative",150)]:
    sets += page(search=q, sort="relevance_score:desc", cap=c, label=f"title:{q[:20]}")

# dedup by id
seen={}
for w in sets:
    if w and w.get('id'): seen[w['id']]=w
corpus=list(seen.values())
with open(OUT,'w',encoding='utf-8') as f:
    for w in corpus: f.write(json.dumps(w,ensure_ascii=False)+"\n")
print(f"TOTAL unique: {len(corpus)} -> {OUT}")
yrs=[w['publication_year'] for w in corpus if w.get('publication_year')]
print(f"year range {min(yrs)}–{max(yrs)}; with refs: {sum(1 for w in corpus if w.get('referenced_works'))}")
