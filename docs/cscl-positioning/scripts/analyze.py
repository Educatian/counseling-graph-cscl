import json, pandas as pd, networkx as nx
from collections import Counter

corpus=[json.loads(l) for l in open('.assets/research/corpus.jsonl',encoding='utf-8')]
ids=set(w['id'] for w in corpus)
meta={}
def first_author(w):
    a=w.get('authorships') or []
    if not a: return "?"
    nm=a[0]['author']['display_name']
    return nm.split()[-1] if nm else "?"
for w in corpus:
    meta[w['id']]={
        'title':w.get('display_name') or '',
        'year':w.get('publication_year'),
        'cites':w.get('cited_by_count',0),
        'fa':first_author(w),
        'venue':(w.get('primary_location') or {}).get('source',{}).get('display_name') if (w.get('primary_location') or {}).get('source') else None,
        'concepts':[c['display_name'] for c in (w.get('concepts') or []) if c.get('level',0)>=1][:6],
    }

# internal citation edges citing->cited
G=nx.DiGraph(); G.add_nodes_from(ids)
edges=0
for w in corpus:
    s=w['id']
    for r in (w.get('referenced_works') or []):
        if r in ids:
            G.add_edge(s,r); edges+=1
print(f"nodes {G.number_of_nodes()} internal-citation edges {edges}")
indeg=dict(G.in_degree())
pr=nx.pagerank(G, alpha=0.85) if edges else {n:0 for n in ids}

rows=[]
for i in ids:
    m=meta[i]
    rows.append({'id':i,'fa':m['fa'],'year':m['year'],'title':m['title'][:90],
                 'global_cites':m['cites'],'in_corpus_cites':indeg.get(i,0),
                 'pagerank':round(pr.get(i,0),5),'venue':m['venue']})
df=pd.DataFrame(rows)
df.to_csv('.assets/research/ranked.csv',index=False,encoding='utf-8')

print("\n=== TOP 25 FUNDAMENTAL (in-corpus citations = field-internal authority) ===")
top=df.sort_values(['in_corpus_cites','global_cites'],ascending=False).head(25)
for _,r in top.iterrows():
    print(f"  {r['in_corpus_cites']:>3}  pr={r['pagerank']:.4f}  g={r['global_cites']:>6}  {r['fa']} {r['year']}  {r['title']}")

print("\n=== TOP 12 by PageRank ===")
for _,r in df.sort_values('pagerank',ascending=False).head(12).iterrows():
    print(f"  pr={r['pagerank']:.4f}  inC={r['in_corpus_cites']:>3}  {r['fa']} {r['year']}  {r['title'][:70]}")

# pyscisci disruption index on internal pub2ref
try:
    from pyscisci.metrics import disruption_index
    pub2ref=pd.DataFrame([(u,v) for u,v in G.edges()],columns=['CitingPublicationId','CitedPublicationId'])
    di=disruption_index(pub2ref)
    di=di.merge(df[['id','fa','year','title','in_corpus_cites']],left_on='PublicationId',right_on='id',how='left')
    di=di[di['in_corpus_cites']>=8].sort_values('DisruptionIndex',ascending=False)
    di.to_csv('.assets/research/disruption.csv',index=False,encoding='utf-8')
    print("\n=== pyscisci DISRUPTION INDEX — most disruptive (inC>=8) ===")
    for _,r in di.head(10).iterrows():
        print(f"  D={r['DisruptionIndex']:+.3f}  inC={int(r['in_corpus_cites'])}  {r['fa']} {r['year']}  {str(r['title'])[:60]}")
    print("  --- most consolidating (developmental) ---")
    for _,r in di.tail(6).iterrows():
        print(f"  D={r['DisruptionIndex']:+.3f}  inC={int(r['in_corpus_cites'])}  {r['fa']} {r['year']}  {str(r['title'])[:60]}")
except Exception as e:
    print("pyscisci disruption failed:",e)
