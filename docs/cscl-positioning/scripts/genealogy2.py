import json, pandas as pd, networkx as nx, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
corpus=[json.loads(l) for l in open('.assets/research/corpus.jsonl',encoding='utf-8')]
df=pd.read_csv('.assets/research/ranked.csv')
top=df.sort_values(['in_corpus_cites','global_cites'],ascending=False).head(24).copy()
topids=set(top['id'])
G=nx.DiGraph(); G.add_nodes_from(topids)
for w in corpus:
    if w['id'] in topids:
        for r in (w.get('referenced_works') or []):
            if r in topids: G.add_edge(w['id'],r)
top['year']=top['year'].fillna(2000).astype(int)
inc={r['id']:r['in_corpus_cites'] for _,r in top.iterrows()}
lab={r['id']:f"{r['fa']} {r['year']}" for _,r in top.iterrows()}
yr={r['id']:r['year'] for _,r in top.iterrows()}
# x = year, y = stable vertical slot avoiding overlap within a year window
order=sorted(topids,key=lambda i:(yr[i],-inc[i]))
ypos={}; lanes=[]
for i in order:
    x=yr[i]; placed=False
    for lane_idx,last in enumerate(lanes):
        if x-last>=3:  # lane free
            ypos[i]=lane_idx; lanes[lane_idx]=x; placed=True; break
    if not placed:
        ypos[i]=len(lanes); lanes.append(x)
pos={i:(yr[i], ypos[i]) for i in topids}
plt.figure(figsize=(17,9)); ax=plt.gca()
nx.draw_networkx_edges(G,pos,edge_color='#b3bdd0',width=0.9,alpha=0.6,arrows=True,arrowsize=9,
    connectionstyle='arc3,rad=0.08',node_size=[inc[i]*9 for i in G.nodes()])
nx.draw_networkx_nodes(G,pos,node_size=[inc[i]*9 for i in G.nodes()],node_color='#8b6fd9',
    alpha=0.9,edgecolors='white',linewidths=1.4)
for i in topids:
    ax.annotate(lab[i],pos[i],fontsize=8.5,ha='center',va='center',
        xytext=(0,-13),textcoords='offset points',color='#0f1729',weight='bold')
ax.set_title("CSCL historiograph — internal-citation genealogy of the 24 most field-authoritative works in the Bridgemap corpus\n(x = publication year · node size = in-corpus citations · arrow = cites)",fontsize=12.5,color='#0f1729')
ax.set_xlabel("Publication year",fontsize=11); ax.set_yticks([])
ax.set_xlim(1986,2020); ax.grid(axis='x',alpha=0.18)
for s in ['top','right','left']: ax.spines[s].set_visible(False)
plt.tight_layout(); plt.savefig('.assets/research/historiograph.png',dpi=135,facecolor='white')
print("saved; edges",G.number_of_edges())
