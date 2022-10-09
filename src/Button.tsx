import React from "react";
import styles from "./Button.module.css";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button(props: ButtonProps) {
  return (
    <button {...props} className={styles.button}>
      {props.children}
    </button>
  );
}
