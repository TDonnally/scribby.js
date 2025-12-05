import { Scribby } from "./components/Scribby.js";

document.addEventListener("DOMContentLoaded", () => {
    const editor = new Scribby("#scribby",
        `
    <h1>Hi there!</h1>
    <p>Jot something down.</p>
    `
    );
    console.log(editor)
    editor.mount();
    (window as any).scribby = editor;

    // controller for dropdown menu
    const container = document.querySelector('.dropdown-menu-container') as HTMLElement;
    const trigger = container.querySelector('button') as HTMLButtonElement;
    const menu = container.querySelector('.dropdown-menu') as HTMLElement;
    const menuButtons = menu.querySelectorAll('button');

    trigger.addEventListener('click', (e) => {
        menu.classList.toggle('show');
        trigger.classList.toggle("active");
    });

    menuButtons.forEach(el => {
        el.addEventListener('click', (e) => {
            trigger.innerText = el.innerText;
            menu.classList.remove('show');
            trigger.classList.remove("active");
        })
    })

    document.addEventListener('click', function(e: MouseEvent): void {
        if (!container.contains(e.target as Node)) {
            menu.classList.remove('show');
            trigger.classList.remove("active");
        }
    });
});