import { Scribby } from "./Scribby.js";
import { InsertModal } from "./InsertModal.js";
import * as utils from "../utilities/utilities.js";

export class LinkModal {
    scribby!: Scribby;
    innerContent: string;
    modalForm: HTMLFormElement;
    referenceRect: DOMRect;
    anchor: HTMLAnchorElement;
    resolveFn!: (value: Record<string, string> | null) => void;
    constructor(
        scribby: Scribby,
        referenceRect: DOMRect,
        anchor: HTMLAnchorElement,
        innerContent: string = `
            <button class = "edit"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>pencil</title><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" /></svg></button>
            <button class = "remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>delete</title><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg></button>
            <a href = "${anchor.href}" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>open-in-new</title><path d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z" /></svg></a>
        `,
    ) {
        this.scribby = scribby;
        this.innerContent = innerContent;
        this.referenceRect = referenceRect;
        this.modalForm = document.createElement("form");
        this.anchor = anchor;
    }
    mount() {
        this.modalForm.classList.add("link-modal");
        this.modalForm.classList.add("modal");
        this.modalForm.innerHTML = this.innerContent;
        this.scribby.el.parentElement!.append(this.modalForm);
        // positioning
        const modalRect = this.modalForm.getBoundingClientRect();
        const parent = this.modalForm.offsetParent as HTMLElement;
        const parentRect = parent.getBoundingClientRect();

        const left = this.referenceRect.left - parentRect.left + (this.referenceRect.width / 2);
        const top = this.referenceRect.top - parentRect.top - modalRect.height - 12;
        this.modalForm.style.left = `${left}px`;
        this.modalForm.style.top = `${top}px`;

        // buttons
        const editButton = this.modalForm.querySelector(".edit");
        const removeButton = this.modalForm.querySelector(".remove");

        editButton?.addEventListener("click", async (e) => {
            const insertModal = new InsertModal(
                this.scribby,
                `
                <label>
                    Url
                    <input name="href" type="text" value = "${utils.normalizeUrl(this.anchor.href)}" required />
                </label>
                `,
                this.referenceRect,
                this.anchor,
            )
            insertModal.mount();
            this.unmount();
            const values = await insertModal.submission();
            const normalized = utils.normalizeUrl(values!.href);

            if (!normalized) {
                alert("Please enter a valid website (example: website.com)");
                return;
            }

            this.anchor.href = normalized;
        });
        removeButton?.addEventListener("click", (e) => {
            utils.replaceElementWithChildren(this.anchor);
            this.unmount();
        });

    }
    unmount() {
        this.modalForm.remove();
    }
}