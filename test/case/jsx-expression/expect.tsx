const test = 'test';
<div className={test}>
  <div className={`${test}-1`}>
    <div className={`${test}-1-1`}>
      <div className={`1-${test}-1-1-1`}/>
    </div>
  </div>
  <div className={`${test}-2`}></div>
  <div className={`${test}-3`}/>
</div>;
