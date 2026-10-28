export class FakeD1 {
  constructor() { this.drafts = new Map(); this.publications = new Map(); this.schemaCreated = false; this.calls = []; }
  get rows(){return this.drafts;} // v13 compatibility
  prepare(sql) {
    const db=this;
    let args=[];
    const statement = {
      bind(...b) { args=b; return statement; },
      async run() {
        db.calls.push({sql,bindings:args});
        if (sql.startsWith('CREATE TABLE')) { db.schemaCreated=true; return {success:true,meta:{changes:0}}; }
        if (!db.schemaCreated) throw new Error('no such table');
        if (sql.startsWith('INSERT INTO article_drafts')) {
          const [id,title,markdown,created_at,updated_at]=args;
          if(db.drafts.has(id)) throw new Error('UNIQUE constraint');
          db.drafts.set(id,{id,title,markdown,status:'draft',created_at,updated_at});
          return {success:true,meta:{changes:1}};
        }
        if (sql.startsWith('INSERT INTO article_publications')) {
          const [id,title,markdown,published_at,updated_at]=args;
          const prior=db.publications.get(id);
          db.publications.set(id,{id,title,markdown,published_at:prior?.published_at||published_at,updated_at});
          return {success:true,meta:{changes:1}};
        }
        if (sql.startsWith('UPDATE article_drafts')) {
          const [title,markdown,updated_at,id]=args;
          const old=db.drafts.get(id); if(!old)return {meta:{changes:0}};
          db.drafts.set(id,{...old,title,markdown,updated_at});return {meta:{changes:1}};
        }
        if (sql.startsWith('DELETE FROM article_publications')) {
          return {meta:{changes:db.publications.delete(args[0])?1:0}};
        }
        if (sql.startsWith('DELETE FROM article_drafts')) {
          return {meta:{changes:db.drafts.delete(args[0])?1:0}};
        }
        throw new Error('unexpected run: '+sql);
      },
      async first() {
        db.calls.push({sql,bindings:args});
        if(sql.includes('FROM article_publications')) {
          const pub=db.publications.get(args[0]);
          if(!pub)return null;
          return sql.includes('published_at')&&!sql.includes('title,markdown,published_at,updated_at') ? {published_at:pub.published_at}: {...pub};
        }
        const draft=db.drafts.get(args[0]);
        if(!draft)return null;
        return {...draft,published_at:db.publications.get(args[0])?.published_at||null};
      },
      async all() {
        db.calls.push({sql,bindings:args});
        if(sql.includes('FROM article_publications')) return {results:[...db.publications.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,50).map(x=>({...x}))};
        return {results:[...db.drafts.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,100).map(d=>({...d,published_at:db.publications.get(d.id)?.published_at||null}))};
      }
    };
    return statement;
  }
  async batch(stmts) { return Promise.all(stmts.map(s=>s.run())); }
}
