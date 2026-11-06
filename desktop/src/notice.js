const invoke=window.__TAURI__.core.invoke;
document.querySelector('#open').textContent=(location.search.includes('failure=1')?'사장님! 문제가 생겼어요!':'사장님! 검수 통과예요!')+'\nSea QA · 클릭하여 실행 기록 열기';
document.querySelector('#open').onclick=()=>invoke('notice_action',{open:true}).catch(console.error);
document.querySelector('#close').onclick=()=>invoke('notice_action',{open:false});
setTimeout(()=>invoke('notice_action',{open:false}),15000);
