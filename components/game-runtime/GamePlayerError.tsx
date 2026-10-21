import styles from './GameRuntime.module.css'
export default function GamePlayerError({message,onRetry,onBack}:{message:string;onRetry:()=>void;onBack?:()=>void}){
  return <div className={styles.overlay}><div className={styles.message} role="alert">
    <p>{message}</p>
    <div className={styles.errorActions}>
      <button className={styles.retry} type="button" onClick={onRetry}>Réessayer</button>
      {onBack && <button className={styles.back} type="button" onClick={onBack}>Retour au launcher</button>}
    </div>
  </div></div>
}
