// A local browser fixture: no account, application, or external service is touched.
const mockStore = {};
window.chrome = {
  runtime: {id:'a'.repeat(32), sendMessage:async (id,msg)=> msg.type === 'socialSync' ? {urls:[],leads:[],seen:[]} : {ok:true}},
  storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,mockStore[k]])),set:async values=>Object.assign(mockStore,values)}},
  tabs:{query:async()=>[{id:7,title:'LinkedIn hiring results',url:'https://www.linkedin.com/search/results/content/'}]},
  scripting:{executeScript:async ({func})=>[{result:func('www.linkedin.com')}]}
};
const post=document.createElement('section');
post.innerHTML='<h2>Feed post</h2><div>Recruiter<br>now<br>We are hiring a Full Stack Software Engineer with 2-4 years experience. Apply here. <a href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.example.com%2Froles%2F42">Apply on Job</a></div><button>Comment</button>';
document.body.append(post);
